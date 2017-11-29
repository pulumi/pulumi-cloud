PROJECT_NAME := Pulumi Cloud Framework (AWS Implementation)
NODE_MODULE_NAME := @pulumi/cloud-aws
include ../build/common.mk

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 10

build::
	yarn install
	yarn link pulumi @pulumi/aws @pulumi/cloud
	tsc

lint::
	tslint -c ../tslint.json -p tsconfig.json

test_all::
	PATH=$(PULUMI_BIN):$(PATH) go test -v -cover -timeout 2h -parallel ${TESTPARALLELISM} ./examples
	PATH=$(PULUMI_BIN):$(PATH) go test -v -cover -timeout 2h -parallel ${TESTPARALLELISM} ./tests
