#!/bin/sh -e

if [ -f .env ]; then
    export $(cat .env | xargs)
    if [ -n $PLUGIN_DIRECTORY_PATH ]; then
        cp main.js $PLUGIN_DIRECTORY_PATH
        cp manifest.json $PLUGIN_DIRECTORY_PATH
    fi
fi
