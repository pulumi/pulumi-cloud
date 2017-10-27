.PHONY: default
default: banner dependencies build

.PHONY: all
all: default

.PHONY: banner
banner:
	@echo "\033[1;37m======================\033[0m"
	@echo "\033[1;37mPulumi Framework mock integration example\033[0m"
	@echo "\033[1;37m======================\033[0m"


.PHONY: dependencies
dependencies:
	yarn install


.PHONY: build
build:
	@echo "\033[0;32mBUILD:\033[0m"
	yarn link pulumi @pulumi/cloud @pulumi/integration-examples # ensure we link dependencies.
	yarn run build
