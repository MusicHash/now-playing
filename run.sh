#!/bin/bash

LOGFILE="log/stream.log";
ERRORFILE="log/err.log";
screen -S now-playing bash -c "/opt/local/sbin/node/bin/node ./src/now-playing.js 1>>$LOGFILE 2>>$ERRORFILE"
