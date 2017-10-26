SHELL=/bin/bash
.SHELLFLAGS=-ec
PROCCNT=$(shell nproc --all)
TESTPARALLELISM=10
ECHO=echo -e

.PHONY: default
default: banner dependencies lint build install

.PHONY: all
all: default examples

.PHONY: banner
banner:
	@$(ECHO) "\033[1;37m======================\033[0m"
	@$(ECHO) "\033[1;37mPulumi Framework AWS implementation package\033[0m"
	@$(ECHO) "\033[1;37m======================\033[0m"

.PHONY: dependencies
dependencies:
	yarn install

.PHONY: lint
lint:
	@$(ECHO) "\033[0;32mLINT:\033[0m"
	@./node_modules/.bin/tslint ...

.PHONY: build
build:
	@$(ECHO) "\033[0;32mBUILD:\033[0m"
	yarn link pulumi @pulumi/aws @pulumi/cloud # ensure we link dependencies.
	yarn run build # compile the LumiPack

.PHONY: install
install:
	@$(ECHO) "\033[0;32mINSTALL:\033[0m [${LUMILIB}]"
	cp package.json bin/
	cd bin/ && (yarn unlink || true) && yarn link # ensure NPM references resolve locally
	cd ../api/bin/ && (yarn unlink @pulumi/cloud-aws || true) && yarn link @pulumi/cloud-aws #ensure loader can see this package

.PHONY: examples
examples:
	@$(ECHO) "\033[0;32mTEST EXAMPLES:\033[0m"
	go test -v -cover -timeout 1h -parallel ${TESTPARALLELISM} ./examples

# The travis_* targets are entrypoints for CI.
.PHONY: travis_cron
travis_cron: all

.PHONY: travis_push
travis_push: all

.PHONY: travis_pull_request
travis_pull_request: all

.PHONY: travis_api
travis_api: all
