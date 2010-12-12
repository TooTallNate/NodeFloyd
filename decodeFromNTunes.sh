#!/usr/bin/env sh

# This example script uses "nTunes" to iterate through the track list
# CRITERIA, and using the result as the playlist for the Icecast server.

# The hostname and port of our Node Icecast server.
ICECAST=localhost:5555

# The filter command to send to nTunes. In this case, get all my "Pink Floyd" songs.
CRITERIA="/source/1/playlist/1/track/artist=Pink%20Floyd"

# The hostname and port of the 'nTunes' server.
NTUNES=localhost:8888

# The concatenated 'curl' command to use when communicating with the nTunes server.
CURL="curl --silent $NTUNES$CRITERIA"

while (true);
  do

  # First, get the total count of the selected criteria.
  N=$[$[`$CURL/count`] + 1];
  
  # Check if 'currentSong' exists. If it does, then load the number from that
  # as a lazy 'saved-state' on server reboots. Otherwise, just set 'i' to 1.
  if [ -e "$PWD/currentSong" ]
  then
    i=`cat "$PWD/currentSong"`;
    echo "Loaded '$i' from 'currentSong'" >&2;
  else
    echo "'currentSong' does not exist, setting index to 1..." >&2;
    i="1";
  fi;

  while [ $i -lt $N ]
    do
    
    # Save the current state, in case we need to reboot the server.
    echo $i > "$PWD/currentSong";
    
    # Get the location, name, artist and album of the track.
    LOCATION=`$CURL/$i/location?format=txt`
    NAME=`$CURL/$i/name?format=txt`
    ARTIST=`$CURL/$i/artist?format=txt`
    ALBUM=`$CURL/$i/album?format=txt`
    DURATION=`$CURL/$i/duration?format=txt`

    # Set a 'metadata' event to update the current track
    curl --silent -X POST -u "node:rules" \
      -H "X-Title: $NAME" \
      -H "X-Artist: $ARTIST" \
      -H "X-Album: $ALBUM" \
      -H "X-Duration: $DURATION" \
      "$ICECAST/metadata" > /dev/null;

    # Use 'ffmpeg' to decode the input file to raw 16-bit PCM, 44100
    ffmpeg -i "$LOCATION" -f s16le -acodec pcm_s16le -ar 44100 -ac 2 - 2>/dev/null;
    
    i=$[ $i + 1 ];
    if [ $i -eq $N ]
    then
      rm "$PWD/currentSong"
    fi

  done;
# Pipe stdout of the neverending 'while' statement (i.e. the continous
# ffmpeg instances) to stdin of our Node server.
done | node server.js;
