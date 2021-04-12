require('dotenv').config();
var readEnv  = require('read-env').readEnv;
var merge  = require('deepmerge');

var envConfig = readEnv('BUILDMONITOR');
if (envConfig.services) {
    var services = [];
    for (var index in envConfig.services) {
        services[+index] = envConfig.services[index];
    }
    envConfig.services = services;
}

var defaultConfig = {
    "monitor": {
        "interval": 5000,
        "numberOfBuilds": 12,
        "latestBuildOnly": false,
        "sortOrder": "date",
        "debug": true
    },
    "services": []
};

var config = merge(defaultConfig, envConfig);

module.exports = config;
