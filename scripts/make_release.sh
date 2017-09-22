#!/bin/bash
# make_release.sh will create a build package ready for publishing.
set -e

ROOT=$(dirname $0)/..
PUBDIR=$(mktemp -du)
GITVER=$(git rev-parse HEAD)
PUBFILE=$(dirname ${PUBDIR})/${GITVER}.tgz
declare -a PUBTARGETS=(${GITVER} $(git describe --tags 2>/dev/null) $(git rev-parse --abbrev-ref HEAD))

# Copy the pack.
mkdir -p $PUBDIR/node_modules/@pulumi/pulumi
mkdir -p $PUBDIR/node_modules/@pulumi/pulumi-framework-aws
cp -R ${ROOT}/api/bin/. ${PUBDIR}/node_modules/@pulumi/pulumi
cp -R ${ROOT}/aws/bin/. ${PUBDIR}/node_modules/@pulumi/pulumi-framework-aws
echo . >> ${PUBDIR}/packs.txt
echo . pulumi >> ${PUBDIR}/packdeps.txt
echo . @pulumi/aws >> ${PUBDIR}/packdeps.txt

# Tar up the file and then print it out for use by the caller or script.
tar -czf ${PUBFILE} -C ${PUBDIR} .
echo ${PUBFILE} ${PUBTARGETS[@]}

