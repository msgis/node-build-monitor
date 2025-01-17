var request = require('request'),
    ntlm = require('httpntlm');
    http = require('http');

module.exports = {
  makeRequest: function (opts, callback) {
    if (opts.authentication && opts.authentication.trim() === 'ntlm') {
      ntlm.get({
        url: opts.url,
        username: opts.username,
        password: opts.password,
        headers: opts.headers || {}
      }, function (error, response) {
        callback(error, JSON.parse(response.body));
      });
    } else {
      request({
          url: opts.url,
          rejectUnauthorized: false,    // Don't validate SSL certs
          headers: opts.headers || {},
          json: true,
          agent: false,
          timeout: 0, // avoid timeouts
          agentOptions: {
            keepAlive: false, // "http.Agent: idle sockets throw unhandled ECONNRESET"
            maxSockets: 200 // Infinity switches globalAgent on.
          }
        },
        function (error, response, body) {
          var callbackCalled = false;
          try {
            if (response != undefined && response.statusCode === 200) {
              callbackCalled = true;
              callback(error, body);
            } else {
              if (response != undefined)
              {
                let httpErrRes = 'HTTP Reponse: '+response.statusCode+' '+http.STATUS_CODES[response.statusCode];
                if (error) {
                  error.message += ' ('+httpErrRes+')';
                  callbackCalled = true;
                  callback(error);
                } else {
                  // If the request never reached the server, then chances are the error object is null, so lets return a status code error instead
                  callbackCalled = true;
                  callback(new Error(httpErrRes), body);
                }
              }
              else {
                callbackCalled = true;
                callback(error, body);
              }
            }
          }
          catch (err) // some exception cannot be handled, like ECONNRESET
          {
            if (!callbackCalled) {
              callback(err, body);
            } else {
              throw err;
            }
          }
        });
    }
  }
};
