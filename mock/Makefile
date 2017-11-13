PROJECT_NAME := Pulumi Cloud Framework (Mock Implementation)
NODE_MODULE_NAME := @pulumi/cloud-mock
include ../build/common.mk

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn link pulumi @pulumi/cloud
	tsc

lint::
	tslint -c ../tslint.json -p tsconfig.json

TEST_PROJECTS := table topic httpEndpoint

test_fast:: $(TEST_PROJECTS:%=test_fast_%)

$(TEST_PROJECTS:%=test_fast_%):
	cd tests/$(@:test_fast_%=%) && yarn install
	cd tests/$(@:test_fast_%=%) && yarn link pulumi @pulumi/cloud @pulumi/cloud-mock
	cd tests/$(@:test_fast_%=%) && yarn run build
	cd tests/$(@:test_fast_%=%) && yarn run test
