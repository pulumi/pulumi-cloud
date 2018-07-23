PROJECT_NAME := Pulumi Cloud Framework (AWS Implementation)
NODE_MODULE_NAME := @pulumi/cloud-aws
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 20

build::
	yarn install

	# pick up the local versions of these if possible.
	yarn link @pulumi/pulumi || true
	yarn link @pulumi/aws || true
	yarn link @pulumi/aws-serverless || true
	yarn link @pulumi/aws-infra || true

	# always pick up the local version of this since it's in the same repo.
	yarn link @pulumi/cloud
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/

lint::
	tslint -c ../tslint.json -p tsconfig.json

test_all::
	PATH=$(PULUMI_BIN):$(PATH) go test -v -cover -timeout 2h -parallel ${TESTPARALLELISM} .

test_fast::
	PATH=$(PULUMI_BIN):$(PATH) go test -short -v -cover -timeout 2h -parallel ${TESTPARALLELISM} .
