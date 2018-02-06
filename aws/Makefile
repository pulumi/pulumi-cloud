PROJECT_NAME := Pulumi Cloud Framework (AWS Implementation)
NODE_MODULE_NAME := @pulumi/cloud-aws
include ../build/common.mk

VERSION := $(shell git describe --tags --dirty 2>/dev/null)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 10

build::
	yarn link pulumi @pulumi/cloud @pulumi/aws
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json.publish > bin/package.json.publish
	cp ../README.md ../LICENSE bin/

lint::
	tslint -c ../tslint.json -p tsconfig.json

test_all::
	PATH=$(PULUMI_BIN):$(PATH) go test -v -cover -timeout 2h -parallel ${TESTPARALLELISM} .
