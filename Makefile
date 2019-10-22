PROJECT_NAME := Pulumi Cloud Platform
SUB_PROJECTS := api azure aws examples/integration
include build/common.mk

.PHONY: publish_packages
publish_packages:
	$(call STEP_MESSAGE)
	./scripts/publish_packages.sh

.PHONY: check_clean_worktree
check_clean_worktree:
	$$(go env GOPATH)/src/github.com/pulumi/scripts/ci/check-worktree-is-clean.sh

# The travis_* targets are entrypoints for CI.
.PHONY: travis_cron travis_push travis_pull_request travis_api
travis_cron: all
travis_push: only_build check_clean_worktree only_test_fast publish_packages
travis_pull_request: only_build check_clean_worktree only_test_fast
travis_api: all

TESTPARALLELISM := 20

test_all::
	$(GO_TEST) ./examples

test_fast::
	$(GO_TEST_FAST) ./examples
