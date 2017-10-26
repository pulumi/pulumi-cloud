SHELL=/bin/bash
.SHELLFLAGS=-ec
PROCCNT=$(shell nproc --all)
ECHO=echo -e

.PHONY: default
default: all

.PHONY: all
all: api aws examples mock test

.PHONY: api
api:
	$(MAKE) -C ./api $(MAKECMDGOALS)

.PHONY: aws
aws:
	$(MAKE) -C ./aws $(MAKECMDGOALS)

.PHONY: examples
examples:
	$(MAKE) -C ./examples all

.PHONY: mock
mock:
	$(MAKE) -C ./mock $(MAKECMDGOALS)

.PHONY: test
test:
	@$(ECHO) "\033[0;32mTEST:\033[0m"
	go test ./pkg/...

.PHONY: publish
publish:
	@$(ECHO) "\033[0;32mPublishing current release:\033[0m"
	./scripts/publish.sh

# The travis_* targets are entrypoints for CI.
.PHONY: travis_cron
travis_cron: all

.PHONY: travis_push
travis_push: all publish

.PHONY: travis_pull_request
travis_pull_request: all

.PHONY: travis_api
travis_api: all
