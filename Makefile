PROCCNT=$(shell nproc --all)
LUMIROOT ?= /usr/local/lumi
LUMILIB   = ${LUMIROOT}/packs
THISLIB   = ${LUMILIB}/platform
TESTPARALLELISM=10

.PHONY: default
default: banner lint build install

.PHONY: all
all: banner lint build install examples

.PHONY: banner
banner:
	@echo "\033[1;37m======================\033[0m"
	@echo "\033[1;37mLumi Platform Package\033[0m"
	@echo "\033[1;37m======================\033[0m"

.PHONY: lint
lint:
	@echo "\033[0;32mLINT:\033[0m"
	@./node_modules/.bin/tslint ...

.PHONY: clean
clean:
	rm -rf ./.lumi/bin
	rm -rf ${THISLIB}

.PHONY: build
build:
	@echo "\033[0;32mBUILD:\033[0m"
	@yarn link @lumi/lumirt @lumi/lumi @lumi/aws @lumi/aws-serverless # ensure we link dependencies.
	@lumijs # compile the LumiPack
	@lumi pack verify # ensure the pack verifies

.PHONY: install
install:
	@echo "\033[0;32mINSTALL:\033[0m [${LUMILIB}]"
	@yarn link # ensure NPM references resolve locally
	@mkdir -p ${LUMILIB} # ensure the machine-wide library dir exists.
	@cp -R ./.lumi/bin/ ${THISLIB} # copy to the standard library location.

.PHONY: examples
examples:
	@echo "\033[0;32mTEST EXAMPLES:\033[0m"
	go test -v -cover -timeout 1h -parallel ${TESTPARALLELISM} ./examples

publish:
	@echo "\033[0;32mPublishing current release:\033[0m"
	./scripts/publish.sh
.PHONY: publish
