from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from django.contrib.auth import get_user_model
from django.db.models import Model, QuerySet

from .i18n import DEFAULT_LOCALE, translate
from .models import GenerationTemplate, StyleTemplate

User = get_user_model()
TemplateKind = Literal["style", "generation"]


@dataclass(frozen=True)
class TemplateUniquenessResult:
    name_unique: bool
    name_message: str | None
    export_name_unique: bool | None = None
    export_name_message: str | None = None


def normalize_template_name(value: str | None) -> str:
    return (value or "").strip()


def normalize_export_name(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    return normalized or None


def resolve_template_model(template_kind: TemplateKind) -> type[Model]:
    if template_kind == "style":
        return StyleTemplate
    if template_kind == "generation":
        return GenerationTemplate
    raise ValueError(f"Unsupported template kind: {template_kind}")


def build_name_conflict_message(
    template_kind: TemplateKind, is_global: bool, locale: str
) -> str:
    if is_global:
        return translate(locale, f"errors.global_name_conflict.{template_kind}")
    return translate(locale, f"errors.own_name_conflict.{template_kind}")


def build_export_name_conflict_message(locale: str) -> str:
    return translate(locale, "errors.export_name_conflict")


def _find_name_conflicts(
    *,
    template_kind: TemplateKind,
    name: str | None,
    owner: User | None,
    is_global: bool,
    template_id: str | None = None,
) -> QuerySet[Model]:
    normalized_name = normalize_template_name(name)
    model = resolve_template_model(template_kind)

    if not normalized_name:
        return model.objects.none()

    conflicts = model.objects.filter(name__iexact=normalized_name)
    if template_id is not None:
        conflicts = conflicts.exclude(pk=template_id)

    if is_global:
        return conflicts.filter(is_global=True)

    return conflicts.filter(is_global=False, owner=owner)


def _find_export_name_conflicts(
    *,
    export_name: str | None,
    owner: User | None = None,
    is_global: bool = False,
    template_id: str | None = None,
) -> QuerySet[GenerationTemplate]:
    normalized_export_name = normalize_export_name(export_name)
    if not normalized_export_name:
        return GenerationTemplate.objects.none()

    conflicts = GenerationTemplate.objects.filter(export_name=normalized_export_name)
    if template_id is not None:
        conflicts = conflicts.exclude(pk=template_id)

    # Shared generation routes resolve by slug only, not by owner or scope. Treat
    # export names as globally unique so private templates cannot collide at the
    # public share URL.
    return conflicts


def check_template_uniqueness(
    *,
    template_kind: TemplateKind,
    name: str | None,
    owner: User | None,
    is_global: bool,
    locale: str | None = None,
    template_id: str | None = None,
    export_name: str | None = None,
) -> TemplateUniquenessResult:
    normalized_locale = locale or DEFAULT_LOCALE
    name_conflicts = _find_name_conflicts(
        template_kind=template_kind,
        name=name,
        owner=owner,
        is_global=is_global,
        template_id=template_id,
    )
    export_name_conflicts = (
        _find_export_name_conflicts(
            export_name=export_name,
            owner=owner,
            is_global=is_global,
            template_id=template_id,
        )
        if template_kind == "generation"
        else None
    )

    name_unique = not name_conflicts.exists()
    export_name_unique = (
        None
        if export_name_conflicts is None
        else not export_name_conflicts.exists()
    )

    return TemplateUniquenessResult(
        name_unique=name_unique,
        name_message=None
        if name_unique
        else build_name_conflict_message(template_kind, is_global, normalized_locale),
        export_name_unique=export_name_unique,
        export_name_message=None
        if export_name_unique in (None, True)
        else build_export_name_conflict_message(normalized_locale),
    )


def build_template_uniqueness_errors(
    *,
    template_kind: TemplateKind,
    name: str | None,
    owner: User | None,
    is_global: bool,
    locale: str | None = None,
    template_id: str | None = None,
    export_name: str | None = None,
) -> dict[str, list[str]]:
    result = check_template_uniqueness(
        template_kind=template_kind,
        name=name,
        owner=owner,
        is_global=is_global,
        locale=locale,
        template_id=template_id,
        export_name=export_name,
    )
    errors: dict[str, list[str]] = {}
    if not result.name_unique and result.name_message:
        errors["name"] = [result.name_message]
    if result.export_name_unique is False and result.export_name_message:
        errors["export_name"] = [result.export_name_message]
    return errors
