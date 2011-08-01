NodeFloyd
=========

Here is an example of an [Icecast][]-compliant server written in JavaScript
and [NodeJS][]. The current setup uses nTunes to request and play all the "Pink
Floyd" songs in my iTunes library. The script could be tweaked to stream any
kind of audio data to the Node server. The server is expecting (on _stdin_):

 * Raw PCM Audio Data
 * 2 Channel
 * 16-bit samples
 * 44,100 samples per second
 * Little-endian


Installation
------------

I won't bother publishing this simple example to the __npm__ registry, but you
can install a local version to hack on like this:

    git clone git://github.com/TooTallNate/NodeFloyd.git
    cd NodeFloyd
    npm install

You will also need the external programs `lame` and `oggenc` installed and
visible to your `$PATH`.


Usage
-----

To launch the server simply invoke the `NodeFloyd` executable (available in
your `PATH` after installation with _npm_), or `./decodeFromNTunes.sh` from
the root directory of the repo.

That will launch an HTTP (Icecast) server on port __5555__. Go there on an
HTML5 `<audio>` compatible web browser (try your smartphone!).

[NodeJS]: http://nodejs.org
[StreamStack]: http://github.com/TooTallNate/node-stream-stack
[Icecast]: http://icecast.org/
