PROJECT_NAME := Pulumi Cloud Framework (API Package)
NODE_MODULE_NAME := @pulumi/cloud
include ../build/common.mk

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link pulumi
	tsc

lint::
	tslint -c ../tslint.json -p tsconfig.json
