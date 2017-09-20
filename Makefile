PROCCNT=$(shell nproc --all)

.PHONY: default
default: api_default aws_default test

.PHONY: all
all: api_all aws_all test


.PHONY: api_default
api_default:
	cd api && $(MAKE)

.PHONY: api_all
api_all:
	cd api && $(MAKE) all


.PHONY: aws_default
aws_default:
	cd aws && $(MAKE)

.PHONY: aws_all
aws_all:
	cd aws && $(MAKE) all


.PHONY: test
test:
	@echo "\033[0;32mTEST:\033[0m"
	go test ./pkg/...