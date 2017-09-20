PROCCNT=$(shell nproc --all)

.PHONY: default
default: api aws local test


.PHONY: api
api:
	cd api && $(MAKE) $(MAKECMDGOALS)


.PHONY: aws
aws:
	cd aws && $(MAKE) $(MAKECMDGOALS)


.PHONY: local
local:
	cd local && $(MAKE) $(MAKECMDGOALS)


.PHONY: test
test:
	@echo "\033[0;32mTEST:\033[0m"
	go test ./pkg/...
  