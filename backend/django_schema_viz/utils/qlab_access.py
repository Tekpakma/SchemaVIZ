from __future__ import annotations

from collections.abc import Iterator

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.db.models import Q
from django.db.utils import OperationalError, ProgrammingError

EXCLUDED_REGISTRY_APP_LABELS = {"django_schema_viz", "qlab"}


def _normalize_model_parts(app_label: str, model_name: str) -> tuple[str, str]:
    return app_label.strip(), model_name.strip().lower()


def get_qlab_allowed_app_labels() -> tuple[str, ...]:
    configured = getattr(settings, "QLAB_SETTINGS", {}).get("ALLOWED_APPS", []) or []
    normalized = []
    for app_label in configured:
        if not isinstance(app_label, str):
            continue
        adjusted = app_label.strip()
        if adjusted:
            normalized.append(adjusted)
    return tuple(normalized)


def is_qlab_app_allowed(app_label: str) -> bool:
    normalized = app_label.strip()
    if not normalized or normalized in EXCLUDED_REGISTRY_APP_LABELS:
        return False
    allowed_apps = get_qlab_allowed_app_labels()
    return not allowed_apps or normalized in allowed_apps


def _group_ids_for_user(user) -> tuple[int, ...]:
    if user is None or not getattr(user, "is_authenticated", False):
        return ()
    return tuple(user.groups.order_by("id").values_list("id", flat=True))


def assert_registry_ready():
    try:
        model_registry = apps.get_model("qlab", "ModelRegistry")
    except LookupError as exc:
        raise ImproperlyConfigured(
            "QLab ModelRegistry is unavailable. Install django-qlab with "
            "ModelRegistry support and add 'qlab' to INSTALLED_APPS."
        ) from exc

    required_tables = {
        model_registry._meta.db_table,
        model_registry.allowed_groups.through._meta.db_table,
    }
    try:
        existing_tables = set(connection.introspection.table_names())
    except (OperationalError, ProgrammingError) as exc:
        raise ImproperlyConfigured(
            "QLab ModelRegistry could not be inspected. Run migrations before using "
            "schema-viz model-facing endpoints."
        ) from exc

    missing_tables = sorted(required_tables - existing_tables)
    if missing_tables:
        joined_tables = ", ".join(missing_tables)
        raise ImproperlyConfigured(
            "QLab ModelRegistry tables are missing "
            f"({joined_tables}). Run Django migrations."
        )

    return model_registry


def _accessible_registry_queryset(user, *, app_label: str | None = None):
    model_registry = assert_registry_ready()
    queryset = model_registry.objects.filter(status="enabled")
    allowed_apps = get_qlab_allowed_app_labels()
    if allowed_apps:
        queryset = queryset.filter(app_label__in=allowed_apps)
    queryset = queryset.exclude(app_label__in=EXCLUDED_REGISTRY_APP_LABELS)
    if app_label:
        if not is_qlab_app_allowed(app_label):
            return queryset.none()
        queryset = queryset.filter(app_label=app_label)

    group_ids = _group_ids_for_user(user)
    if group_ids:
        queryset = queryset.filter(
            Q(is_restricted=False) | Q(allowed_groups__id__in=group_ids)
        )
    else:
        queryset = queryset.filter(is_restricted=False)

    return queryset.distinct().order_by("app_label", "model_name")


def is_model_accessible_for_user(user, app_label: str, model_name: str) -> bool:
    normalized_app_label, normalized_model_name = _normalize_model_parts(
        app_label, model_name
    )
    if not normalized_app_label or not normalized_model_name:
        return False

    return _accessible_registry_queryset(
        user,
        app_label=normalized_app_label,
    ).filter(model_name__iexact=normalized_model_name).exists()


def get_accessible_models_for_user(
    user, app_label: str | None = None
) -> Iterator[tuple[apps.AppConfig, type]]:
    normalized_app_label = app_label.strip() if isinstance(app_label, str) else None
    for registry_entry in _accessible_registry_queryset(user, app_label=normalized_app_label):
        try:
            model = apps.get_model(registry_entry.app_label, registry_entry.model_name)
        except LookupError:
            continue
        yield model._meta.app_config, model


def get_manageable_models() -> Iterator[tuple[apps.AppConfig, type]]:
    for app_config in apps.get_app_configs():
        if app_config.label in EXCLUDED_REGISTRY_APP_LABELS:
            continue
        if not is_qlab_app_allowed(app_config.label):
            continue
        for model in app_config.get_models():
            yield app_config, model
