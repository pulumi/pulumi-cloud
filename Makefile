PROJECT_NAME := Pulumi Cloud Platform
SUB_PROJECTS := api aws mock examples/integration
include build/common.mk

.PHONY: publish
publish:
	$(call STEP_MESSAGE)
	./scripts/publish.sh

.PHONY: queue_sdk_build
queue_sdk_build:
	$(call STEP_MESSAGE)
	./scripts/queue-sdk-build.sh

# The travis_* targets are entrypoints for CI.
.PHONY: travis_cron travis_push travis_pull_request travis_api
travis_cron: all
travis_push: only_build publish only_test queue_sdk_build
travis_pull_request: all
travis_api: all
