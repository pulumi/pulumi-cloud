PROJECT_NAME := Pulumi Cloud Framework (Mock Implementation)
NODE_MODULE_NAME := @pulumi/cloud-mock
include ../build/common.mk

VERSION := $(shell git describe --tags --dirty 2>/dev/null)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	yarn install
	yarn link @pulumi/pulumi @pulumi/cloud
	tsc
	sed -e "s/\$${VERSION}/$(VERSION)/g" < package.json > bin/package.json
	sed -e "s/\$${VERSION}/$(VERSION)/g" < package.json.publish > bin/package.json.publish

lint::
	tslint -c ../tslint.json -p tsconfig.json

TEST_PROJECTS := table topic httpEndpoint

test_fast:: $(TEST_PROJECTS:%=test_fast_%)

$(TEST_PROJECTS:%=test_fast_%):
	cd tests/$(@:test_fast_%=%) && yarn install
	cd tests/$(@:test_fast_%=%) && yarn link @pulumi/pulumi @pulumi/cloud @pulumi/cloud-mock
	cd tests/$(@:test_fast_%=%) && yarn run build
	cd tests/$(@:test_fast_%=%) && yarn run test
