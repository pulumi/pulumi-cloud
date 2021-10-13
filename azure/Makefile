PROJECT_NAME := Pulumi Cloud Framework (Azure Implementation)
NODE_MODULE_NAME := @pulumi/cloud-azure
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)
WORKING_DIR := $(shell pwd)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link @pulumi/cloud
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/

lint::
	tslint -c ../tslint.json -p tsconfig.json
