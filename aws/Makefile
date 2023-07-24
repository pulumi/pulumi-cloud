PROJECT_NAME := Pulumi Cloud Framework (AWS Implementation)
NODE_MODULE_NAME := @pulumi/cloud-aws
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link @pulumi/cloud
	yarn run tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/

lint::
	yarn run tslint -c ../tslint.json -p tsconfig.json
