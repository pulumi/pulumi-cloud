PROCCNT=$(shell nproc --all)
TESTPARALLELISM=10

.PHONY: default
default: banner dependencies build lint install

.PHONY: all
all: default

.PHONY: banner
banner:
	@echo "\033[1;37m======================\033[0m"
	@echo "\033[1;37mPulumi Framework integration example\033[0m"
	@echo "\033[1;37m======================\033[0m"

.PHONY: dependencies
dependencies:
	yarn install


.PHONY: build
build:
	@echo "\033[0;32mBUILD:\033[0m"
	yarn link pulumi @pulumi/cloud @pulumi/tslint-rules # ensure we link dependencies.
	yarn run build # compile the LumiPack


.PHONY: lint
lint:
	@echo "\033[0;32mLINT:\033[0m"
	yarn run lint


.PHONY: install
install:
	@echo "\033[0;32mINSTALL:\033[0m [${LUMILIB}]"
	cp package.json bin/
	cd bin/ && (yarn unlink || true) && yarn link # ensure NPM references resolve locally
