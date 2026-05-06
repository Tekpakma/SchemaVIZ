.PHONY: help migrate makemigrations run shell createsuperuser test clean reset-db loaddata seed-benchmark build-package test-min-deps release-patch release-minor release-major

MIN_DEPS_PYTHON ?= 3.11
MIN_DEPS_VENV ?= /tmp/django-schema-viz-min-deps-$(MIN_DEPS_PYTHON)
MIN_DJANGO_SPEC ?= 4.2.*
MIN_DRF_SPEC ?= 3.15.*
MIN_DRF_CAMEL_CASE_SPEC ?= 1.4.2
MIN_DRF_DATACLASSES_SPEC ?= 1.4.0
MIN_CORS_SPEC ?= 4.0
MIN_DEBUG_TOOLBAR_SPEC ?= 6.1.0
MIN_DRF_SPECTACULAR_SPEC ?= 0.29.0
MIN_FAKER_SPEC ?= 24.0.0
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
	@echo "  make migrate         - Apply database migrations"
	@echo "  make makemigrations  - Create new migrations"
	@echo "  make run             - Run development server"
	@echo "  make shell           - Open Django shell"
	@echo "  make createsuperuser - Create a superuser"
	@echo "  make test            - Run tests"
	@echo "  make build-package   - Build wheel and sdist in dist/"
	@echo "  make test-min-deps   - Verify the declared minimum dependency floor"
	@echo "  make release-patch   - Bump patch version, commit it, and tag backend-vX.Y.Z"
	@echo "  make release-minor   - Bump minor version, commit it, and tag backend-vX.Y.Z"
	@echo "  make release-major   - Bump major version, commit it, and tag backend-vX.Y.Z"
	@echo "                         Add PUSH=1 to also push $(RELEASE_BRANCH) and the new tag"
	@echo "  make clean           - Remove Python cache files"
	@echo "  make reset-db        - Delete and recreate database"
	@echo "  make loaddata        - Load test infrastructure data"
	@echo "  make seed-benchmark  - Generate large fake benchmark data"

migrate:
	uv run python manage.py migrate

makemigrations:
	uv run python manage.py makemigrations django_schema_viz

run:
	uv run python manage.py runserver

shell:
	uv run python manage.py shell

createsuperuser:
	uv run python manage.py createsuperuser

test:
	uv run python manage.py test

build-package:
	uv run --with build python -m build

test-min-deps:
	uv venv --python $(MIN_DEPS_PYTHON) $(MIN_DEPS_VENV)
	uv pip install --python $(MIN_DEPS_VENV)/bin/python \
		"django==$(MIN_DJANGO_SPEC)" \
		"djangorestframework==$(MIN_DRF_SPEC)" \
		"djangorestframework-camel-case==$(MIN_DRF_CAMEL_CASE_SPEC)" \
		"djangorestframework-dataclasses==$(MIN_DRF_DATACLASSES_SPEC)" \
		"django-cors-headers>=$(MIN_CORS_SPEC)" \
		"django-debug-toolbar>=$(MIN_DEBUG_TOOLBAR_SPEC)" \
		"drf-spectacular>=$(MIN_DRF_SPECTACULAR_SPEC)" \
		"faker>=$(MIN_FAKER_SPEC)"
	uv pip install --python $(MIN_DEPS_VENV)/bin/python --no-deps -e .
	$(MIN_DEPS_VENV)/bin/python manage.py test

release-patch:
	python3 scripts/release_backend.py patch $(RELEASE_ARGS)

release-minor:
	python3 scripts/release_backend.py minor $(RELEASE_ARGS)

release-major:
	python3 scripts/release_backend.py major $(RELEASE_ARGS)

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete

reset-db:
	rm -f db.sqlite3
	uv run python manage.py migrate
	@echo "Database reset complete. Run 'make createsuperuser' to create admin user."

loaddata:
	uv run python manage.py shell < create_infrastructure_data.py

seed-benchmark:
	uv run python manage.py generate_fake_infra --profile pagination --label benchmark --replace
