#!/bin/bash
# publish.sh builds and publishes a release.
set -o nounset -o errexit -o pipefail

ROOT=$(dirname $0)/..
PUBLISH=$GOPATH/src/github.com/pulumi/home/scripts/publish.sh
PUBLISH_GOOS=("linux" "windows" "darwin")
PUBLISH_GOARCH=("amd64")
PUBLISH_PROJECT="pulumi-cloud"

if [ ! -f $PUBLISH ]; then
    >&2 echo "error: Missing publish script at $PUBLISH"
    exit 1
fi

echo "Publishing SDK build to s3://eng.pulumi.com/:"
for OS in "${PUBLISH_GOOS[@]}"
do
    for ARCH in "${PUBLISH_GOARCH[@]}"
    do
        export GOOS=${OS}
        export GOARCH=${ARCH}

        RELEASE_INFO=($($(dirname $0)/make_release.sh))
        ${PUBLISH} ${RELEASE_INFO[0]} "${PUBLISH_PROJECT}/${OS}/${ARCH}" ${RELEASE_INFO[@]:1}
    done
done

echo "Publishing NPM packages to NPMjs.com:"
for PACK in "api/bin" "aws/bin"
do
    pushd ${ROOT}/${PACK}

    # If there's an alternative publishing package.json, use that instead.  This is necessary for some packages
    # because of the way we use symlinks in the ordinary package.json files for local development.
    if [ -f "package.json.publish" ]; then
        mv package.json package.json.dev
        mv package.json.publish package.json
    fi

    npm publish
    npm info 2>/dev/null

    # Restore the original package.json structure if needed.
    if [ -f "package.json.dev" ]; then
        mv package.json package.json.publish
        mv package.json.dev package.json
    fi

    popd
done
