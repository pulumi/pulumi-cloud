PROJECT_NAME := Pulumi Cloud Framework (Mock Implementation)
NODE_MODULE_NAME := @pulumi/cloud-mock
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link @pulumi/cloud
	tsc
	sed -e "s/\$${VERSION}/$(VERSION)/g" < package.json > bin/package.json

lint::
	tslint -c ../tslint.json -p tsconfig.json
