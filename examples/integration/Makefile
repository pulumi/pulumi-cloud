PROJECT_NAME := Pulumi Cloud Platform Integration Examples
include ../../../build/common.mk

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link pulumi @pulumi/cloud
	tsc

lint::
	tslint -c ../tslint.json -p tsconfig.json
