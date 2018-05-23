PROJECT_NAME := Pulumi Cloud Platform
SUB_PROJECTS := api mock aws examples/integration
include build/common.mk


.PHONY: publish_tgz
publish_tgz:
	$(call STEP_MESSAGE)
	./scripts/publish_tgz.sh

.PHONY: publish_packages
publish_packages:
	$(call STEP_MESSAGE)
	./scripts/publish_packages.sh

# The travis_* targets are entrypoints for CI.
.PHONY: travis_cron travis_push travis_pull_request travis_api
travis_cron: all
travis_push: only_build publish_tgz only_test_fast publish_packages
travis_pull_request: only_build only_test_fast
travis_api: all
