#!/bin/bash
set -o nounset -o errexit -o pipefail
SCRIPT_DIR="$( cd "$( dirname "$0" )" && pwd )"

if [ -z "${TRAVIS_API_KEY:-}" ]; then
    >&2 echo "set TRAVIS_API_KEY before running this script"
    exit 1
fi

if [ -z "${APPVEYOR_API_KEY:-}" ]; then
    >&2 echo "set APPVEYOR_API_KEY before running this script"
    exit 1
fi

GIT_VERSION=$(git describe --tags --dirty)
GIT_REF=$(git rev-parse HEAD)

TRAVIS_REQUEST_BODY=\
"{
 \"request\": {
   \"message\": \"Automated SDK Build\",
   \"branch\": \"master\",
   \"config\": {
     \"env\": {
       \"SDK_VERSION_STRING\": \"${GIT_VERSION}\",
       \"PULUMI_CLOUD_COMMIT\": \"${GIT_REF}\"
      }
    }
  }
}"

APPVEYOR_REQUEST_BODY=\
"{
    \"accountName\": \"Pulumi\",
    \"projectSlug\": \"sdk\",
    \"branch\": \"master\",
    \"environmentVariables\": {
       \"SdkVersionString\": \"${GIT_VERSION}\",
       \"PulumiCloudCommit\": \"${GIT_REF}\",
       \"ShouldBuildSdk\": \"true\"
    }
}"

curl -s -X POST \
     -H "Content-Type: application/json" \
     -H "Accept: application/json" \
     -H "Travis-API-Version: 3" \
     -H "Authorization: token ${TRAVIS_API_KEY}" \
     -d "${TRAVIS_REQUEST_BODY}" \
     https://api.travis-ci.com/repo/pulumi%2Fsdk/requests

curl -s -X POST \
     -H "Authorization: Bearer ${APPVEYOR_API_KEY}" \
     -H "Content-Type: application/json" \
     -d "${APPVEYOR_REQUEST_BODY}" \
     https://ci.appveyor.com/api/builds
