PROJECT_NAME := Pulumi Cloud Framework (API Package)
NODE_MODULE_NAME := @pulumi/cloud
include ../build/common.mk

VERSION := $(shell ../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

build::
	tsc
	sed -e "s/\$${VERSION}/$(VERSION)/g" < package.json > bin/package.json
	cp ../README.md ../LICENSE bin/
	$(MAKE) docs

docs::
	node_modules/.bin/typedoc --json \
		bin/docs.json --mode modules --includeDeclarations --excludeExternals --excludeNotExported

lint::
	tslint -c ../tslint.json -p tsconfig.json
