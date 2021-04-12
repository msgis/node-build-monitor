var request = require('../requests');
var async = require('async');

module.exports = function () {
    var self = this,
        cachedRepoUrls = null,
        maxPageLen = 100,
        concurrentRequests = 20,
        makeUrl = function (repoUrl) {
            var fields = [
                'values.uuid', 'values.build_number', 'values.state.name',
                'values.state.result.name', 'values.state.stage.name',
                'values.created_on',
                'values.completed_on', 'values.created_on', 'values.build_seconds_used',
                'values.creator.display_name',
                'values.repository.links.html.href',
                'values.repository.full_name',
                'values.target.ref_name'
            ];
            return repoUrl + '/pipelines/?sort=-created_on&pagelen=' + maxPageLen + '&fields=' + fields.join();
        },
        makeRepositoryUrl = function () {
            var workspace = self.configuration.teamname || self.configuration.username;
            return 'https://api.bitbucket.org/2.0/repositories/' + workspace + '/' + self.configuration.slug;
        },
        makeListRepositoriesUrl = function () {
            var workspace = self.configuration.teamname || self.configuration.username;
            var fields = encodeURIComponentMany(['next', 'values.links.self.href']);
            return 'https://api.bitbucket.org/2.0/repositories/' + workspace + '?pagelen=' + maxPageLen + '&fields=' + fields.join();
        },
        makeBasicAuthToken = function() {
            return Buffer.from(self.configuration.username + ':' + self.configuration.apiKey).toString('base64');
        },
        makeRequest = function (url, callback) {
          request.makeRequest({
            url: url,
            headers: {Authorization: 'Basic ' + makeBasicAuthToken()}
          }, callback);
        },
        encodeURIComponentMany = function (array) {
            for (var i = 0; i < array.length; i++) {
                array[i] = encodeURIComponent(array[i]);
            }
            return array;
        },
        parseDate = function (dateAsString) {
            return dateAsString ? new Date(dateAsString) : null;
        },
        parseDateAddSeconds = function (dateAsString, seconds) {
            var date = dateAsString ? new Date(dateAsString) : null;
            return date && seconds ? new Date(date.getTime() + seconds * 1000) : null;
        },
        forEachResult = function (body, callback) {
            for (var i = 0; i < body.values.length; i++) {
                callback(body.values[i]);
            }
        },
        flatten = function (arrayOfArray) {
            return [].concat.apply([], arrayOfArray);
        },
        getStatus = function (statusText, resultText, stageText) {
            if (statusText === "COMPLETED" && resultText === "SUCCESSFUL") return "Green";
            if (statusText === "COMPLETED" && resultText === "FAILED") return "Red";
            if (statusText === "COMPLETED" && resultText === "STOPPED") return "Gray";
            if (statusText === "PENDING") return "'#FFA500'";
            if (statusText === "IN_PROGRESS" && stageText === "PAUSED") return "Gray";
            if (statusText === "IN_PROGRESS") return "Blue";
        },
        getStatusText = function (statusText, resultText, stageText) {
            if (statusText === "COMPLETED" && resultText === "SUCCESSFUL") return "Succeeded";
            if (statusText === "COMPLETED" && resultText === "FAILED") return "Failed";
            if (statusText === "COMPLETED" && resultText === "STOPPED") return "Stopped";
            if (statusText === "PENDING") return "Pending";
            if (statusText === "IN_PROGRESS" && stageText === "PAUSED") return "Paused";
            if (statusText === "IN_PROGRESS") return "In Progress";

            return statusText;
        },
        getIsRunning = function (statusText, _resultText, stageText) {
            return statusText === "IN_PROGRESS" && stageText !== "PAUSED";
        },
        getIsQueued = function (statusText, _resultText, _stageText) {
            return statusText === "PENDING";
        },
        getProject = function (res) {
            var project = res.repository.full_name.replace('/', ' » ');
            return project + (res.target && res.target.ref_name ? (' » ' +  res.target.ref_name) : '');
        },
        getEstimatedDuration = function (res, previous) {
            var totalBuildSeconds = 0;
            var totalBuildCount = 0;

            previous = previous.slice(0, 5);

            var addResult = function (res) {
                var statusText = getStatusText(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name);
                if (statusText === "Succeeded" || statusText === "Paused") {
                    totalBuildSeconds += res.build_seconds_used;
                    totalBuildCount++;
                }
            };

            addResult(res);

            for (var i = 0; i < previous.length; i++) {
                addResult(previous[i]);
            }

            var duration = Math.round((totalBuildSeconds / totalBuildCount) * 1000);
            return duration && !isNaN(duration) ? duration : null;
        },
        simplifyBuild = function (res, previous) {
            previous = previous || [];
            return {
                id: res.uuid,
                project: getProject(res),
                number: res.build_number,
                isRunning: getIsRunning(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name),
                isQueued: getIsQueued(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name),
                startedAt: parseDate(res.created_on),
                finishedAt: parseDate(res.completed_on) || parseDateAddSeconds(res.created_on, res.build_seconds_used),
                estimatedDuration: getEstimatedDuration(res, previous),
                requestedFor: res.creator.display_name,
                statusText: getStatusText(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name),
                status: getStatus(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name),
                url: res.repository.links.html.href + '/addon/pipelines/home#!/results/' + res.build_number
            };
        },
        queryBuildsForRepo = function (repoUrl, callback) {
            makeRequest(makeUrl(repoUrl), function (error, body) {
                if (error || body.type === 'error') {
                    callback(error || body.error);
                    return;
                }

                var builds = [];
                var byProject = {};

                forEachResult(body, function (res) {
                    var project = getProject(res);
                    if (!byProject[project]) {
                        byProject[project] = [];
                    }
                    byProject[project].push(res);
                });

                for (var project in byProject) {
                    var build = simplifyBuild(byProject[project].shift(), byProject[project]);
                    builds.push(build);
                }

                callback(error, builds);
            });
        },
        queryBuilds = function (callback) {
            var repoUrl = makeRepositoryUrl();
            queryBuildsForRepo(repoUrl, callback);
        },
        queryPipelinesEnabled = function (repoUrl, callback) {
            // We could use the pipelines config endpoint
            // `/2.0/repositories/{workspace}/{repo_slug}/pipelines_config`
            // and read `enabled` from the response.
            // But then the user and the app token needs admin permissions.
            makeRequest(repoUrl + '/pipelines/?pagelen=1&fields=size', function (error, body) {
                callback(error || body.error, body && body.size);
            });
        },
        queryRepositories = function (url, callback) {
            callback = arguments.length > 1 ? callback : url;
            url = arguments.length > 1 && url ? url : makeListRepositoriesUrl();

            makeRequest(url, function (error, body) {
                if (error || body.type === 'error') {
                    callback(error || body.error, []);
                    return;
                }

                var repoUrls = [];

                forEachResult(body, function (res) {
                    repoUrls.push(res.links.self.href);
                });

                if (body.next) {
                    queryRepositories(body.next, function (error, newUrls) {
                        repoUrls = repoUrls.concat(newUrls);
                        callback(error, repoUrls);
                    });
                } else {
                    callback(error, repoUrls);
                }
            });
        },
        queryRepositoriesFiltered = function (callback) {
            queryRepositories(function (error, repoUrls) {
                if (error) {
                    callback(error);
                    return;
                }

                async.filterLimit(repoUrls, concurrentRequests, queryPipelinesEnabled, function (error, repoUrls) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    callback(error, repoUrls);
                });
            });
        },
        queryBuildsForRepositories = function (repoUrls, callback) {
            async.mapLimit(repoUrls, concurrentRequests, function (repoUrl, callback) {
                queryBuildsForRepo(repoUrl, callback);
            }, function (error, results) {
                callback(error, flatten(results));
            });
        },
        queryBuildsForTeamOrUser = function (callback) {
            if (!cachedRepoUrls) {
                queryRepositoriesFiltered(function (error, repoUrls) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    cachedRepoUrls = repoUrls;
                    queryBuildsForRepositories(repoUrls, callback);
                });
            } else {
                queryBuildsForRepositories(cachedRepoUrls, callback);
            }
        };

    self.configure = function (config) {
        self.configuration = config;
    };

    self.check = function (callback) {
        if (self.configuration.slug) {
            queryBuilds(callback);
        } else {
            queryBuildsForTeamOrUser(callback);
        }
    };
};
