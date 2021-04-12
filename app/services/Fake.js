
function assign (obj, props) {
    for (key in props) {
        obj[key] = props[key];
    }
};

function calcBuildTimer (build) {
    var timer = Date.now() - build.startedAt - build.estimatedDuration;
    return isNaN(timer) || (timer > 0) ? 0 : -timer;
};

module.exports = function () {
    var self = this,
        clone = function (obj) {
            return JSON.parse(JSON.stringify(obj));
        };

    self.builds = [];

    self.configure = function () {

    };

	self.check = function (callback) {
        callback(null, clone(self.builds));
    };

    self.add = function (options) {
        options = options || {};
        var params = clone(options);
        delete params.finished;
        var finished = options.finished;
        var hasErrors = options.hasErrors;
        var started = finished ? Date.now() - 30000 : Date.now();
        var build = {
            id: 'project_' + (self.builds.length + 1),
            project: 'project',
            number: 'build#' + (self.builds.length + 1),
            isRunning: !finished,
            startedAt: new Date(started),
            finishedAt: finished ? new Date(started + 20000) : null,
            estimatedDuration: 2 * 60 * 1000,
            requestedFor: 'author',
            status: finished ? hasErrors ? 'Red' : 'Green' : 'Blue',
            statusText: 'statusText',
            reason: 'reason',
            hasErrors: hasErrors,
            hasWarnings: hasErrors,
            url: 'https://httpbin.com'
        };

        assign(build, params);

        self.builds.push(build);
        return build;
    };

    // build1
    // short running build, takes 30s to successfully complete
    var build1 = self.add({
        estimatedDuration: 30 * 1000
    });
    setTimeout(function () {
        assign(build1, {
            finishedAt: new Date(),
            isRunning: false,
            status: 'Green'
        });
    }, calcBuildTimer(build1));

    // build2
    // runs for 15s and then finishes with errors
    var build2 = self.add({
        estimatedDuration: 2 * 60 * 1000
    });
    setTimeout(function () {
        assign(build2, {
            finishedAt: new Date(),
            isRunning: false,
            status: 'Red',
            hasErrors: true
        });
    }, 15 * 1000);

    // build3
    // has already successfully finished
    self.add({
        finished: true
    });

    // build4
    // longer running build, takes 1m to successfully complete
    var build4 = self.add({
        estimatedDuration: 1 * 60 * 1000
    });
    setTimeout(function () {
        assign(build4, {
            finishedAt: new Date(),
            isRunning: false,
            status: 'Green'
        });
    }, calcBuildTimer(build4));

    // build5
    // has already successfully finished
    self.add({
        finished: true
    });

    // build6
    // has already finished with errors
    self.add({
        finished: true,
        hasErrors: true,
        status: 'Red'
    });

    // build7
    // takes longer than estimated
    var build7 = self.add({
        estimatedDuration: 30 * 1000
    });
    setTimeout(function () {
        assign(build7, {
            finishedAt: new Date(),
            isRunning: false,
            status: 'Green'
        });
    }, calcBuildTimer(build7) + 30 * 1000);

    // build8
    // takes 20s to complete and has already been run for 10s
    var build8 = self.add({
        startedAt: new Date(Date.now() - 10 * 1000),
        estimatedDuration: 20 * 1000
    });
    setTimeout(function () {
        assign(build8, {
            finishedAt: new Date(),
            isRunning: false,
            status: 'Green'
        });
    }, calcBuildTimer(build8));

    // build9
    // no estimated duration available
    var build9 = self.add({
        estimatedDuration: null
    });
    setTimeout(function () {
        assign(build9, {
            finishedAt: new Date(),
            isRunning: false,
            status: 'Green'
        });
    }, 40 * 1000);

    return self;
};
