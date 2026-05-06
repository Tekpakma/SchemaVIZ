from __future__ import annotations

from django.apps import apps
from django.conf import settings

from qlab.models import ModelRegistry


EXCLUDED_REGISTRY_APP_LABELS = {"django_schema_viz", "qlab"}


def _configured_app_labels() -> list[str]:
    configured = getattr(settings, "QLAB_SETTINGS", {}).get("ALLOWED_APPS", []) or []
    if configured:
        return [app_label for app_label in configured if app_label not in EXCLUDED_REGISTRY_APP_LABELS]
    return [
        app_config.label
        for app_config in apps.get_app_configs()
        if app_config.label not in EXCLUDED_REGISTRY_APP_LABELS
    ]


def _registry_entry_for_model(app_label: str, model) -> ModelRegistry:
    entry, _created = ModelRegistry.objects.get_or_create(
        model_label=f"{app_label}_{model.__name__}",
        defaults={
            "app_label": app_label,
            "model_name": model.__name__,
            "status": "enabled",
        },
    )
    update_fields: list[str] = []
    if entry.app_label != app_label:
        entry.app_label = app_label
        update_fields.append("app_label")
    if entry.model_name != model.__name__:
        entry.model_name = model.__name__
        update_fields.append("model_name")
    if entry.status != "enabled":
        entry.status = "enabled"
        update_fields.append("status")
    if update_fields:
        entry.save(update_fields=update_fields)
    return entry


def seed_qlab_registry(
    model_refs: list[str] | tuple[str, ...] | None = None,
    *,
    clear: bool = False,
) -> None:
    if clear:
        ModelRegistry.objects.all().delete()
    if model_refs is not None:
        for model_ref in model_refs:
            app_label, model_name = model_ref.split(".", 1)
            model = apps.get_model(app_label, model_name)
            _registry_entry_for_model(app_label, model)
        return

    for app_label in _configured_app_labels():
        try:
            app_config = apps.get_app_config(app_label)
        except LookupError:
            continue
        for model in app_config.get_models():
            _registry_entry_for_model(app_config.label, model)


def reset_qlab_registry() -> None:
    ModelRegistry.objects.all().delete()


def set_registry_entry(
    model_ref: str,
    *,
    status: str = "enabled",
    is_restricted: bool = False,
    allowed_groups=(),
):
    app_label, model_name = model_ref.split(".", 1)
    model = apps.get_model(app_label, model_name)
    entry, _created = ModelRegistry.objects.get_or_create(
        model_label=f"{app_label}_{model.__name__}",
        defaults={
            "app_label": app_label,
            "model_name": model.__name__,
        },
    )
    entry.app_label = app_label
    entry.model_name = model.__name__
    entry.status = status
    entry.is_restricted = is_restricted
    entry.save(update_fields=["app_label", "model_name", "status", "is_restricted"])
    entry.allowed_groups.set(allowed_groups)
    return entry
