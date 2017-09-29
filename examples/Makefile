SHELL=/bin/bash
.SHELLFLAGS=-ec
PROCCNT=$(shell nproc --all)
ECHO=echo -e

.PHONY: all
all: crawler integration todo

.PHONY: crawler
crawler:

.PHONY: integration
integration:
	$(MAKE) -C ./integration all

.PHONY: todo
todo:
