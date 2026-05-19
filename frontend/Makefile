.PHONY: help dev build test lint format check generate-api release-patch release-minor release-major

RELEASE_REMOTE ?= origin
RELEASE_BRANCH ?= main
RELEASE_ARGS = --branch $(RELEASE_BRANCH) --remote $(RELEASE_REMOTE)
ifneq ($(PUSH),)
RELEASE_ARGS += --push
endif
ifneq ($(DRY_RUN),)
RELEASE_ARGS += --dry-run
endif
ifneq ($(ALLOW_DIRTY),)
RELEASE_ARGS += --allow-dirty
endif

help:
	@echo "Available commands:"
	@echo "  make dev             - Start development server"
	@echo "  make build           - Build for production"
	@echo "  make test            - Run tests"
	@echo "  make lint            - Run ESLint"
	@echo "  make format          - Format with Prettier + ESLint fix"
	@echo "  make check           - Check formatting"
	@echo "  make generate-api    - Regenerate API client from OpenAPI schema"
	@echo "  make release-patch   - Bump patch version, commit, and tag frontend-vX.Y.Z"
	@echo "  make release-minor   - Bump minor version, commit, and tag frontend-vX.Y.Z"
	@echo "  make release-major   - Bump major version, commit, and tag frontend-vX.Y.Z"
	@echo "                         Add PUSH=1 to also push $(RELEASE_BRANCH) and the new tag"
	@echo "                         Add DRY_RUN=1 to preview without making changes"
	@echo "                         Add ALLOW_DIRTY=1 to skip clean-tree check"

dev:
	bunx --bun vite dev

build:
	bunx --bun vite build

test:
	bunx --bun vitest run

lint:
	eslint

format:
	prettier --write . && eslint --fix

check:
	prettier --check .

generate-api:
	bun ./scripts/generate-api-client.ts

release-patch:
	python3 scripts/release_frontend.py patch $(RELEASE_ARGS)

release-minor:
	python3 scripts/release_frontend.py minor $(RELEASE_ARGS)

release-major:
	python3 scripts/release_frontend.py major $(RELEASE_ARGS)
