#!/bin/bash

LOGFILE="log/stream.log";
ERRORFILE="log/err.log";
screen -S now-playing bash -c "npm start 1>>$LOGFILE 2>>$ERRORFILE"
