require("colors");
var connect = require('connect');
var throttle = require('throttle');
var encoder = require('./encoder');

process.title = "NodeFloyd";

// An external script is meant to be writing PCM data to stdin of the server.
var stdin = process.openStdin();
encoder.stdin = stdin;

// Stdin is expecting raw PCM data of the format:
var SAMPLE_SIZE = 16;   // 16-bit samples, Little-Endian, Signed
var CHANNELS = 2;       // 2 channels (left and right)
var SAMPLE_RATE = 44100;// 44,100 Hz sample rate.

// If we're getting raw PCM data as expected, calculate the number of bytes
// that need to be read for `1 Second` of audio data.
var BLOCK_ALIGN = SAMPLE_SIZE / 8 * CHANNELS; // Number of 'Bytes per Sample'
var BYTES_PER_SECOND = SAMPLE_RATE * BLOCK_ALIGN;


// Throttle stdin based on the calculated BYTES_PER_SECOND value
throttle(stdin, BYTES_PER_SECOND);


// A simple "Burst-on-Connect" implementation. We'll store the previous "10
// seconds" worth of raw PCM data, and send it each time a new Icecast
// connection is made.
encoder.bocData = bocData = [];
var bocSize = BYTES_PER_SECOND * 10; // 10 raw PCM seconds in bytes
stdin.on("data", onStdinData);
function onStdinData(chunk) {
  bocData.push(chunk);
  var removed = 0;
  while (currentBocSize() > bocSize) {
    removed += bocData.shift().length;
  }
  
  // If we've removed a number of bytes that isn't a multiple of BLOCK_ALIGN,
  // then we'd be left with a partial audio sample, which at best case reverses
  // the audio channels, and at worst makes the bytes 16-bit ints be offset by 1,
  // resulting in awful static sound.
  var stillToRemove = removed % BLOCK_ALIGN;
  while (stillToRemove > 0) {
    if (bocData[0].length <= stillToRemove) {
      stillToRemove -= bocData.shift().length;
    } else {
      bocData[0] = bocData[0].slice(stillToRemove);
      stillToRemove = 0;
    }
  }
}
function currentBocSize() {
  var size = 0;
  var i=0
  var l=bocData.length;
  for (; i<l; i++) {
    size += bocData[i].length;
  }
  return size;
}


var name = "TooTallNate's Pink Floyd Collection"
encoder.name = name;
var metaint = 8192;
encoder.metaint = metaint;
// Array of HttpServerResponse objects that are listening clients.
encoder.clients = clients = [];
encoder.icecastClients = icecastClients = [];

// The max number of listening Icecast clients allowed at a time.
// There's a limit because each connection invokes it's own instance of
// lame, oggenc, aacplusenc, etc. The HTTP Live Streaming is just a matter of
// serving regular static files, so those clients don't increment the count...
encoder.maxClients = maxClients = 15;

encoder.metadata = metadata = {};
encoder.currentTrack = currentTrack = "unknown";
var currentTrackStartTime;
var duration;
var dId;
// Using 'stdin' just because it's a convient "main" EventEmitter to piggy back from
stdin.on("metadata", function(metadataObj) {
  encoder.metadata = metadata = metadataObj;
  encoder.currentTrack = currentTrack = metadata.title
                  + (metadata.artist ? ' - ' + metadata.artist : '')
                  + (metadata.album ? ' - ' + metadata.album : '');
  console.log(("Received 'metadata' event: ".bold + currentTrack).blue);
  for (var i=0, l=icecastClients.length; i<l; i++) {
    icecastClients[i].queueMetadata(currentTrack);
  }
});

// Now we create the HTTP server.
var server = connect.createServer(
  connect.logger(),
  encoder.Encoder('/stream.mp3', 'audio/mpeg', "lame", [
    "-S", // Operate silently (nothing to stderr)
    "-r", // Input is raw PCM
    "-s", SAMPLE_RATE / 1000, // Input sampling rate: 44,100
    "-", // Input from stdin
    "-" // Output to stderr
  ]),
  encoder.Encoder('/stream.ogg', 'application/ogg', "oggenc", [
    "--silent", // Operate silently (nothing to stderr)
    "-r", // Raw input
    "--raw-rate=" + SAMPLE_RATE, // Raw input rate: 44100
    "-" // Input from stdin, Output to stderr
  ]),
  // TODO: Add 'faac' for AAC encoding support!!
  encoder.Encoder('/stream.aacp', 'audio/aacp', process.env.HOME + '/aacplusenc/aacplusenc', [
    // No args for now
  ]),
  function(req, res, next) {

    // If "/metadata" is requested, then hold of on sending any response, but
    // request the `icecast.ReadStream` instance to notify the request of the next
    // 'metadata' event.
    if (req.url == "/metadata") {
      if (req.method == "POST") {

        var auth = req.headers.authorization;
        var ct = req.headers['x-title'];
        var returnCode = 401;
        if (ct && auth && auth.substring(0, 6) == "Basic " && Buffer(auth.substring(6), 'base64').toString('ascii') == 'node:rules') {
          stdin.emit('metadata', {
            title: ct,
            artist: req.headers['x-artist'],
            album: req.headers['x-album'],
            duration: req.headers['x-duration']
          });
          returnCode = 200;
        }
        res.writeHead(returnCode);
        res.end();        

      } else if (req.headers['x-current-track']) {
        var metadataJson = JSON.stringify(metadata);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(metadataJson)
        });
        res.end(metadataJson);
      } else {
        req.connection.setTimeout(60 * 60 * 1000); // One-hour timeouts
        stdin.once("metadata", function(metadata) {
          var metadataJson = JSON.stringify(metadata);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(metadataJson)
          });
          res.end(metadataJson);
        });
      }
    } else {
      next();
    }
  },
  connect.static(__dirname + "/www")
);
server.listen(5555);
console.log(("HTTP Icecast server listening at: ".bold + "http://*:" + server.address().port).cyan);

process.on('uncaughtException', function(e) {
  console.log("UNCAUGHT EXCEPTION:".red.bold, e.message);
  console.log(e.stack);
});

// Takes a Number in seconds, and returns a String in format mm:ss.
// Used in metadata events to compatible clients (VLC).
function prettyPrintTime(seconds) {
  seconds = Number(seconds);
  var mins = Math.floor(seconds/60);
  var secs = seconds % 60;
  return mins + ":" + (secs < 10 ? "0":"") + Math.floor(secs);
}
