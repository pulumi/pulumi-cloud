#!/bin/bash
# make_release.sh will create a build package ready for publishing.
set -e

ROOT=$(dirname $0)/..
PUBDIR=$(mktemp -du)
GITVER=$(git rev-parse HEAD)
PUBFILE=$(dirname ${PUBDIR})/${GITVER}.tgz

# Figure out which branch we're on. Prefer $TRAVIS_BRANCH, if set, since
# Travis leaves us at detached HEAD and `git rev-parse` just returns "HEAD".
BRANCH=${TRAVIS_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}
declare -a PUBTARGETS=(${GITVER} $(git describe --tags) ${BRANCH})

# Copy the pack.
mkdir -p $PUBDIR
cp -R ${ROOT}/aws/bin/. ${PUBDIR}/
echo . >> ${PUBDIR}/packs.txt
echo . pulumi >> ${PUBDIR}/packdeps.txt
echo . @pulumi/aws >> ${PUBDIR}/packdeps.txt

# Tar up the file and then print it out for use by the caller or script.
tar -czf ${PUBFILE} -C ${PUBDIR} .
echo ${PUBFILE} ${PUBTARGETS[@]}
