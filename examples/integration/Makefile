SHELL=/bin/bash
.SHELLFLAGS=-ec
PROCCNT=$(shell nproc --all)
ECHO=echo -e
TESTPARALLELISM=10

.PHONY: default
default: banner dependencies build install

.PHONY: all
all: default

.PHONY: banner
banner:
	@$(ECHO) "\033[1;37m======================\033[0m"
	@$(ECHO) "\033[1;37mPulumi Framework integration example\033[0m"
	@$(ECHO) "\033[1;37m======================\033[0m"

.PHONY: dependencies
dependencies:
	yarn install


.PHONY: build
build:
	@$(ECHO) "\033[0;32mBUILD:\033[0m"
	yarn link pulumi @pulumi/cloud # ensure we link dependencies.
	yarn run build # compile the LumiPack


.PHONY: install
install:
	@$(ECHO) "\033[0;32mINSTALL:\033[0m [${LUMILIB}]"
	cp package.json bin/
	cd bin/ && (yarn unlink || true) && yarn link # ensure NPM references resolve locally
