#!/bin/bash
# buildandpush.sh builds and pushes the lukehoban/nodejsrunner Docker image to the public Docker hub.
set -e

docker build --tag lukehoban/nodejsrunner ./nodejsrunner

docker push lukehoban/nodejsrunner
