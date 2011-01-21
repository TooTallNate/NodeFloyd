var icecast = require("icecast-stack");
var spawn = require("child_process").spawn;

exports.Encoder = function(stream, contentType, spawnName, spawnOpts) {

  return function(req, res, next) {

    // Does the client support icecast metadata?
    var acceptsMetadata = req.headers['icy-metadata'] == 1;

    var parsed = require('url').parse(req.url, true);

    if (parsed.pathname == stream) {

      // Sorry, too busy, try again later!
      if (exports.clients.length >= exports.maxClients) {
        res.writeHead(503);
        return res.end("The maximum number of clients ("+exports.maxClients+") are aleady connected, try connecting again later...")
      }

      console.log(req.headers);
    
      var headers = {
        "Content-Type": contentType,
        "Connection": "close",
        "Transfer-Encoding": "identity"
      };
      if (acceptsMetadata) {
        headers['icy-name'] = exports.name;
        headers['icy-metaint'] = exports.metaint;
      }
      res.writeHead(200, headers);

      if (acceptsMetadata) {
        res = new icecast.IcecastWriteStack(res, exports.metaint);
        res.queueMetadata(exports.currentTrack);
        exports.icecastClients.push(res);
      }

      var encoder = spawn(spawnName, spawnOpts);
      encoder.stdout.on("data", function(chunk) {
        res.write(chunk);
      });

      // First, send what's inside the "Burst-on-Connect" buffers.
      for (var i=0, l=exports.bocData.length; i<l; i++) {
        encoder.stdin.write(exports.bocData[i]);
      }

      // Then start sending the incoming PCM data to the MP3 encoder
      var callback = function(chunk) {
        encoder.stdin.write(chunk);
      }
      exports.stdin.on("data", callback);
      exports.clients.push(res);
      console.log(((spawnName+" " + (acceptsMetadata ? "Icecast " : "") + "Client Connected: "+req.connection.remoteAddress+"!").bold + " Total " + clients.length).green);

      req.connection.on("close", function() {
        // This occurs when the HTTP client closes the connection.
        exports.clients.splice(exports.clients.indexOf(res), 1);
        if (acceptsMetadata) {
          exports.icecastClients.splice(exports.icecastClients.indexOf(res), 1);
        }
        encoder.stdin.end();
        exports.stdin.removeListener("data", callback);
        console.log(((spawnName+" " + (acceptsMetadata ? "Icecast " : "") + "Client Disconnected: "+req.connection.remoteAddress+" :(").bold + " Total " + clients.length).red);
      });
    } else {
      next();
    }
  }
}
