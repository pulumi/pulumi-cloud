PROJECT_NAME := Pulumi Cloud Framework (Azure Implementation)
NODE_MODULE_NAME := @pulumi/cloud-azure
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 20

build::
	yarn link @pulumi/cloud
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/

lint::
	tslint -c ../tslint.json -p tsconfig.json

test_all::
	PATH=$(PULUMI_BIN):$(PATH) go test -v -count=1 -cover -timeout 2h -parallel ${TESTPARALLELISM} .

test_fast::
	PATH=$(PULUMI_BIN):$(PATH) go test -short -v -count=1 -cover -timeout 2h -parallel ${TESTPARALLELISM} .
