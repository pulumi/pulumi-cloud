TESTPARALLELISM=10

.PHONY: default
default: banner run

.PHONY: banner
banner:
	@echo "\033[1;37m======================\033[0m"
	@echo "\033[1;37mPulumi Framework AWS unittests package\033[0m"
	@echo "\033[1;37m======================\033[0m"

.PHONY: run
run:
	go test -v -cover -timeout 1h -parallel ${TESTPARALLELISM} .
