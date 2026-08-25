"""
Central configuration for django-schema-viz.

All settings are read from a single ``SCHEMA_VIZ`` dict in Django settings.
When a key is absent (or ``SCHEMA_VIZ`` itself is not defined), the default
values below are used – which match the original hard-coded behaviour so that
zero-config deployments keep working.
"""

from importlib import import_module

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

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
    # Permissions for endpoints that expose no project data at all
    # (backend version, shape registry). Empty list = public access.
    "PUBLIC_PERMISSION_CLASSES": [],
    # Additional permission classes appended to PUBLIC_PERMISSION_CLASSES.
    "EXTRA_PUBLIC_PERMISSION_CLASSES": [],
    # Permissions for read-only schema introspection endpoints
    # (graph, models, model-details, apps, query, route).
    #
    # These expose the complete data model, so they require authentication by
    # default. Set to ``[]`` to make them public.
    "INTROSPECTION_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Additional permission classes appended to INTROSPECTION_PERMISSION_CLASSES.
    "EXTRA_INTROSPECTION_PERMISSION_CLASSES": [],
    # Row-level scoping hook applied to every queryset schema-viz runs against
    # consumer models (generation runs, shared runs, query lab).
    #
    # Dotted path to a callable ``(queryset, user) -> QuerySet``. The callable
    # receives the unscoped queryset (``queryset.model`` identifies the model)
    # and must return a queryset narrowed to the records *user* may see.
    #
    # ``None`` disables row-level filtering: the QLab model registry stays the
    # only boundary. Multi-tenant deployments must set this, otherwise any
    # authenticated user can read any record by guessing a primary key on a
    # shared generation link.
    "RECORD_SCOPE": None,
    # Master switch for the AI assistant and the MCP server. When ``False`` the
    # frontend hides the chat and refuses MCP requests.
    "AI_ENABLED": True,
    # Deployment-wide fallbacks used whenever a user has not configured their
    # own values. The API key is deliberately *not* configurable here: it is
    # always read from the per-user preference (or the frontend's environment).
    "AI_DEFAULT_MODEL": "",
    "AI_DEFAULT_BASE_URL": "",
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


def resolve_callable(dotted_path):
    """
    Resolve a dotted-path string to a callable.

    An already-callable value passes through unchanged so settings can be
    written either as a string or as a direct reference. Returns ``None``
    when *dotted_path* is ``None``.
    """
    if dotted_path is None:
        return None
    if callable(dotted_path):
        return dotted_path
    if not isinstance(dotted_path, str):
        raise ImproperlyConfigured(
            f"Expected a dotted path or callable, got {type(dotted_path).__name__}."
        )
    try:
        resolved = _import_class(dotted_path)
    except (ImportError, AttributeError, ValueError) as exc:
        raise ImproperlyConfigured(f'Could not import "{dotted_path}".') from exc
    if not callable(resolved):
        raise ImproperlyConfigured(f'"{dotted_path}" is not callable.')
    return resolved
