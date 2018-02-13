PROJECT_NAME := Pulumi Cloud Framework (API Package)
NODE_MODULE_NAME := @pulumi/cloud
include ../build/common.mk

VERSION := $(shell git describe --tags --dirty 2>/dev/null)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link @pulumi/pulumi
	tsc
	sed -e "s/\$${VERSION}/$(VERSION)/g" < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/

lint::
	tslint -c ../tslint.json -p tsconfig.json
