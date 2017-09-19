PROCCNT=$(shell nproc --all)

.PHONY: default
default: aws_default test

.PHONY: all
all: aws_all test

.PHONY: aws_default
aws_default:
	cd aws && make

.PHONY: aws_all
aws_all:
	cd aws && make all

.PHONY: test
test:
	@echo "\033[0;32mTEST:\033[0m"
	go test ./pkg/...