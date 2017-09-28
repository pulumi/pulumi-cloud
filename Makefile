PROCCNT=$(shell nproc --all)

.PHONY: all
all: api aws mock test

.PHONY: api
api:
	$(MAKE) -C ./api all

.PHONY: aws
aws:
	$(MAKE) -C ./aws all

.PHONY: mock
mock:
	$(MAKE) -C ./mock all

.PHONY: test
test:
	@echo "\033[0;32mTEST:\033[0m"
	go test ./pkg/...

.PHONY: publish
publish:
	@echo "\033[0;32mPublishing current release:\033[0m"
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
