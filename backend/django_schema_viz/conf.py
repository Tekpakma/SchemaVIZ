"""
Central configuration for django-schema-viz.

All settings are read from a single ``SCHEMA_VIZ`` dict in Django settings.
When a key is absent (or ``SCHEMA_VIZ`` itself is not defined), the default
values below are used – which match the original hard-coded behaviour so that
zero-config deployments keep working.
"""

from importlib import import_module

from django.conf import settings

DEFAULTS: dict = {
    # Authentication classes applied to all schema-viz views.
    # ``None`` means "use DRF's global DEFAULT_AUTHENTICATION_CLASSES".
    "AUTHENTICATION_CLASSES": None,
    # Permissions for views that serve user-owned data (read access):
    # drawings list/retrieve, tour progress, exports.
    "USER_DATA_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Additional permission classes appended to USER_DATA_PERMISSION_CLASSES.
    "EXTRA_USER_DATA_PERMISSION_CLASSES": [],
    # Permissions for owner-gated mutations (create/update/delete):
    # drawings, style templates, generation templates.
    "OWNER_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "django_schema_viz.permissions.IsOwner",
    ],
    # Additional permission classes appended to OWNER_PERMISSION_CLASSES.
    "EXTRA_OWNER_PERMISSION_CLASSES": [],
    # Permissions for read-only schema introspection endpoints
    # (graph, models, model-details, apps, query, route).
    # Empty list = public access.
    "INTROSPECTION_PERMISSION_CLASSES": [],
    # Additional permission classes appended to INTROSPECTION_PERMISSION_CLASSES.
    "EXTRA_INTROSPECTION_PERMISSION_CLASSES": [],
}


def get_setting(key: str):
    """
    Read a single key from the ``SCHEMA_VIZ`` settings dict,
    falling back to ``DEFAULTS``.
    """
    user_settings = getattr(settings, "SCHEMA_VIZ", {})
    return user_settings.get(key, DEFAULTS[key])


def _import_class(dotted_path: str):
    """Import a class from its dotted string path."""
    module_path, class_name = dotted_path.rsplit(".", 1)
    module = import_module(module_path)
    return getattr(module, class_name)


def resolve_classes(dotted_paths: list | None) -> list | None:
    """
    Resolve a list of dotted-path strings to actual classes.

    Returns ``None`` when *dotted_paths* is ``None``, which signals
    "use the DRF global default".
    """
    if dotted_paths is None:
        return None
    return [_import_class(p) if isinstance(p, str) else p for p in dotted_paths]
