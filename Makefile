.PHONY: all
all: api aws examples mock

.PHONY: api
api:
	$(MAKE) -C ./api all

.PHONY: aws
aws:
	$(MAKE) -C ./aws all

.PHONY: examples
examples:
	$(MAKE) -C ./examples all

.PHONY: mock
mock:
	$(MAKE) -C ./mock all

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
