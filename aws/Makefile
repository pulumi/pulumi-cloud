PROJECT_NAME := Pulumi Cloud Framework (AWS Implementation)
NODE_MODULE_NAME := @pulumi/cloud-aws
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 10

build::
	yarn link @pulumi/pulumi @pulumi/cloud @pulumi/aws @pulumi/aws-infra
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/

lint::
	tslint -c ../tslint.json -p tsconfig.json

test_all::
	PATH=$(PULUMI_BIN):$(PATH) go test -v -cover -timeout 2h -parallel ${TESTPARALLELISM} .
