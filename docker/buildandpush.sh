#!/bin/bash
# buildandpush.sh builds and pushes the lukehoban/javascriptrunner Docker image to the public Docker hub.
set -e

docker build --tag lukehoban/javascriptrunner ./javascriptrunner

docker push lukehoban/javascriptrunner
