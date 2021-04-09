var request = require('../requests');
var async = require('async');

module.exports = function () {
    var self = this,
        cachedRepoUrls = null,
        makeUrl = function (repoUrl) {
            return repoUrl + '/pipelines/?sort=-created_on&pagelen=1';
        },
        makeRepositoryUrl = function () {
            return 'https://api.bitbucket.org/2.0/repositories/' + (self.configuration.teamname || self.configuration.username) + '/' + self.configuration.slug;
        },
        makeListRepositoriesUrl = function () {
            return 'https://api.bitbucket.org/2.0/repositories/' + (self.configuration.teamname || self.configuration.username) + '?pagelen=50';
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
        parseDate = function (dateAsString) {
            return dateAsString ? new Date(dateAsString) : null;
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
        simplifyBuild = function (res) {
            return {
                id: res.uuid,
                project: res.repository.name,
                number: res.build_number,
                isRunning: !res.completed_on,
                startedAt: parseDate(res.created_on),
                finishedAt: parseDate(res.completed_on),
                requestedFor: res.creator.display_name,
                statusText: getStatusText(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name),
                status: getStatus(res.state.name, (res.state.result || {}).name, (res.state.stage || {}).name),
                url: res.repository.links.self.href
            };
        },
        queryBuildsForRepo = function (repoUrl, callback) {
            makeRequest(makeUrl(repoUrl), function (error, body) {
                if (error || body.type === 'error') {
                    callback(error || body.error);
                    return;
                }

                var builds = [];

                forEachResult(body, function (res) {
                    builds.push(simplifyBuild(res));
                });

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
            makeRequest(repoUrl + '/pipelines/?pagelen=1', function (error, body) {
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

                async.filterLimit(repoUrls, 10, queryPipelinesEnabled, function (error, repoUrls) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    callback(error, repoUrls);
                });
            });
        },
        queryBuildsForRepositories = function (repoUrls, callback) {
            async.mapLimit(repoUrls, 10, function (repoUrl, callback) {
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
