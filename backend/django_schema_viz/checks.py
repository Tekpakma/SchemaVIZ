from __future__ import annotations

import sys

from django.core.checks import Warning, register
from django.core.exceptions import ImproperlyConfigured

from django_schema_viz.utils.qlab_access import assert_registry_ready


@register()
def check_qlab_registry(app_configs, **kwargs):
    if "test" in sys.argv:
        return []

    try:
        model_registry = assert_registry_ready()
    except ImproperlyConfigured as exc:
        return [
            Warning(
                str(exc),
                hint="Run Django migrations so QLab can create and register its model registry.",
                id="django_schema_viz.W001",
            )
        ]

    if not model_registry.objects.exists():
        return [
            Warning(
                "QLab ModelRegistry is empty, so schema-viz model-facing endpoints "
                "will expose no models.",
                hint="Run `python manage.py migrate` so QLab can register allowed "
                "models, then review or enable them through QLab-backed admin tooling.",
                id="django_schema_viz.W002",
            )
        ]

    return []
