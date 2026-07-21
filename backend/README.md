# django-schema-viz

Reusable Django app for schema-aware diagram exploration, drawing persistence,
template-driven generation, and export endpoints.

## Install

```bash
pip install django-schema-viz
```

## Django Setup

Add the app to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    # ...
    "django_schema_viz",
    "qlab",
]
```

Include the routes in your project URL config:

```python
from django.urls import include, path

urlpatterns = [
    path("schema-viz/", include("django_schema_viz.urls")),
]
```

Run migrations:

```bash
python manage.py migrate
```

## Optional Configuration

`SCHEMA_VIZ` controls authentication and permission classes. Runtime model
authorization comes from QLab `ModelRegistry`.

The backend uses `django-qlab` from PyPI. Install the package dependencies
normally, then run:

```bash
python manage.py migrate
```

After that, QLab admin is the canonical place to enable, disable, and
group-restrict models. Schema-viz also exposes staff-only frontend APIs for the
same registry state at `/schema-viz/model-registry/`, plus `/candidates/`
and `/groups/` helper actions for admin tooling.

For v1, `django_schema_viz` intentionally ships a single clean initial
migration. Existing 0.x installations need a deliberate manual migration path
or a fresh install before upgrading to v1; no Django `replaces` compatibility
migrations are provided for the reset.

The package installs Django REST Framework dependencies automatically.
`django-cors-headers` is only needed if your deployment serves the frontend
from a different origin and you want the backend to answer cross-origin
browser requests.

### Permission configuration

Permission settings are category-based:

- `INTROSPECTION_PERMISSION_CLASSES`
- `USER_DATA_PERMISSION_CLASSES`
- `OWNER_PERMISSION_CLASSES`

Each category also supports additive settings that are appended to the base
list, preserving defaults:

- `EXTRA_INTROSPECTION_PERMISSION_CLASSES`
- `EXTRA_USER_DATA_PERMISSION_CLASSES`
- `EXTRA_OWNER_PERMISSION_CLASSES`

Example (keep defaults and add one custom permission to all categories):

```python
SCHEMA_VIZ = {
    "EXTRA_INTROSPECTION_PERMISSION_CLASSES": [
        "my_project.permissions.SchemaVizAccessPermission",
    ],
    "EXTRA_USER_DATA_PERMISSION_CLASSES": [
        "my_project.permissions.SchemaVizAccessPermission",
    ],
    "EXTRA_OWNER_PERMISSION_CLASSES": [
        "my_project.permissions.SchemaVizAccessPermission",
    ],
}
```

### OAuth2 authentication (Django OAuth Toolkit)

When deployed with DOT (Django OAuth Toolkit) as the OIDC provider, TanStack Start forwards the
user's DOT access token to Django. Configure DRF to validate tokens using DOT's built-in
authentication backend:

```python
INSTALLED_APPS = [
    # ...
    "oauth2_provider",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "oauth2_provider.contrib.rest_framework.OAuth2Authentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
}
```

Custom permission classes can use `request.user` for ownership checks and `request.auth` for
scope-aware policy decisions.

### Reset for development

```bash
uv run manage.py schema_viz_migration_reset --fresh-reset --confirm-drop-data
```
