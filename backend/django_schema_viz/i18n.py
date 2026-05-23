from __future__ import annotations

from typing import Iterable

from django.utils.translation import activate

DEFAULT_LOCALE = "en"
SUPPORTED_LOCALES = ("en", "de")
LOCALE_HEADER = "X-SchemaViz-Locale"

_MESSAGES = {
    "de": {
        "errors.only_staff_global_templates": "Nur Mitarbeitende mit Admin-Rechten dürfen globale Templates erstellen.",
        "errors.only_staff_featured_templates": "Nur Mitarbeitende mit Admin-Rechten dürfen empfohlene Templates verwalten.",
        "errors.featured_requires_global": "Empfohlene Templates müssen global verfügbar sein.",
        "errors.featured_rank_requires_featured": "Ein Rang ist nur für empfohlene Templates erlaubt.",
        "errors.global_name_conflict.style": "Es existiert bereits ein globales Node Template mit diesem Namen.",
        "errors.global_name_conflict.generation": "Es existiert bereits ein globales Generation Template mit diesem Namen.",
        "errors.own_name_conflict.style": "Du hast bereits ein Node Template mit diesem Namen.",
        "errors.own_name_conflict.generation": "Du hast bereits ein Generation Template mit diesem Namen.",
        "errors.export_name_conflict": "Dieser Export-URL-Name ist bereits vergeben.",
        "errors.invalid_request": "Ungültige Anfrage",
        "errors.execution_failed": "Ausführung fehlgeschlagen",
        "errors.preview_failed": "Vorschau fehlgeschlagen",
        "errors.failed_schema_graph": "Schema-Graph konnte nicht geladen werden",
        "errors.failed_schema_route": "Pfad konnte nicht berechnet werden",
        "errors.failed_models": "Modelle konnten nicht geladen werden",
        "errors.failed_apps": "Apps konnten nicht geladen werden",
    },
    "en": {
        "errors.only_staff_global_templates": "Only staff members can create global templates.",
        "errors.only_staff_featured_templates": "Only staff members can manage featured templates.",
        "errors.featured_requires_global": "Featured templates must be global.",
        "errors.featured_rank_requires_featured": "A feature rank is only allowed for featured templates.",
        "errors.global_name_conflict.style": "A global node template with this name already exists.",
        "errors.global_name_conflict.generation": "A global generation template with this name already exists.",
        "errors.own_name_conflict.style": "You already have a node template with this name.",
        "errors.own_name_conflict.generation": "You already have a generation template with this name.",
        "errors.export_name_conflict": "This export URL name is already in use.",
        "errors.invalid_request": "Invalid request",
        "errors.execution_failed": "Execution failed",
        "errors.preview_failed": "Preview failed",
        "errors.failed_schema_graph": "Failed to retrieve schema graph",
        "errors.failed_schema_route": "Failed to calculate route",
        "errors.failed_models": "Failed to retrieve models",
        "errors.failed_apps": "Failed to retrieve apps",
    },
}


def normalize_locale(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        return DEFAULT_LOCALE
    base = normalized.split("-", 1)[0]
    if base in SUPPORTED_LOCALES:
        return base
    return DEFAULT_LOCALE


def resolve_request_locale(request) -> str:
    user = getattr(request, "user", None)
    if getattr(user, "is_authenticated", False):
        preference = getattr(user, "schema_viz_preference", None)
        if preference and preference.locale in SUPPORTED_LOCALES:
            return preference.locale

    explicit_locale = normalize_locale(request.headers.get(LOCALE_HEADER))
    if explicit_locale in SUPPORTED_LOCALES and request.headers.get(LOCALE_HEADER):
        return explicit_locale

    return DEFAULT_LOCALE


def activate_request_locale(request) -> str:
    locale = resolve_request_locale(request)
    activate(locale)
    setattr(request, "schema_viz_locale", locale)
    return locale


def translate(locale: str, key: str, **kwargs) -> str:
    normalized_locale = normalize_locale(locale)
    message = _MESSAGES.get(normalized_locale, {}).get(key) or _MESSAGES[DEFAULT_LOCALE].get(key) or key
    return message.format(**kwargs)


def translate_request(request, key: str, **kwargs) -> str:
    locale = getattr(request, "schema_viz_locale", None) or resolve_request_locale(request)
    return translate(locale, key, **kwargs)


def available_locales() -> Iterable[str]:
    return SUPPORTED_LOCALES
