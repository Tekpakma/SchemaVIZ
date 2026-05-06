from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from django.apps import apps
from django.contrib.contenttypes.models import ContentType

from .qlab_access import is_model_accessible_for_user
from .schema_discovery import ModelInfo, ModelInfoShort, SchemaDiscoveryService

TARGET_MODEL_STATUS_MISSING = "missing"
TARGET_MODEL_STATUS_OK = "ok"
TARGET_MODEL_STATUS_STALE = "stale"

FORCED_MODEL_STATUS_UNUSED = "unused"
FORCED_MODEL_STATUS_MISSING = "missing"
FORCED_MODEL_STATUS_OK = "ok"
FORCED_MODEL_STATUS_INCOMPATIBLE = "incompatible"
FORCED_MODEL_STATUS_INACCESSIBLE = "inaccessible"
FORCED_MODEL_STATUS_STALE = "stale"


def parse_model_ref(model_ref: str | None) -> tuple[str, str] | None:
    if not isinstance(model_ref, str):
        return None

    normalized = model_ref.strip()
    if not normalized:
        return None

    separator = "." if "." in normalized else ":"
    try:
        app_label, model_name = normalized.split(separator, 1)
    except ValueError:
        return None

    app_label = app_label.strip()
    model_name = model_name.strip().lower()
    if not app_label or not model_name:
        return None
    return app_label, model_name


def build_model_ref(app_label: str, model_name: str) -> str:
    return f"{app_label}.{model_name.lower()}"


def get_target_model_status_for_content_type(
    target_content_type: ContentType | None,
) -> str:
    if target_content_type is None:
        return TARGET_MODEL_STATUS_MISSING
    return (
        TARGET_MODEL_STATUS_OK
        if target_content_type.model_class() is not None
        else TARGET_MODEL_STATUS_STALE
    )


def get_target_model_ref_for_content_type(
    target_content_type: ContentType | None,
) -> str | None:
    if get_target_model_status_for_content_type(target_content_type) != TARGET_MODEL_STATUS_OK:
        return None
    return build_model_ref(target_content_type.app_label, target_content_type.model)


def resolve_content_type_for_model_ref(model_ref: str | None) -> ContentType | None:
    parsed = parse_model_ref(model_ref)
    if parsed is None:
        return None

    app_label, model_name = parsed
    try:
        model = apps.get_model(app_label, model_name)
    except LookupError:
        return None

    return ContentType.objects.get_for_model(model, for_concrete_model=False)


def resolve_model_info_from_ref(model_ref: str | None, user=None) -> ModelInfo | None:
    parsed = parse_model_ref(model_ref)
    if parsed is None:
        return None
    app_label, model_name = parsed
    return SchemaDiscoveryService.get_model_by_name(user, app_label, model_name)


@dataclass(frozen=True)
class StyleTemplateCompatibilitySummary:
    compatible_models: list[ModelInfoShort]
    forced_model: ModelInfoShort | None
    forced_model_status: str

    @property
    def compatible_model_count(self) -> int:
        return len(self.compatible_models)


class StyleTemplateCompatibilityService:
    @classmethod
    def is_required_path_compatible(
        cls,
        *,
        root_model: ModelInfo,
        required_path: str,
        user=None,
        model_info_cache: dict[str, ModelInfo] | None = None,
    ) -> bool:
        if not isinstance(required_path, str):
            return False

        segments = [segment.strip() for segment in required_path.split(".") if segment.strip()]
        if not segments:
            return False

        if model_info_cache is None:
            model_info_cache = {}

        current_model = root_model
        for index, segment in enumerate(segments):
            is_last = index == len(segments) - 1
            if is_last:
                model_fields = {field.name for field in current_model.fields}
                model_fields.add("id")
                return segment in model_fields

            relation = next(
                (relation for relation in current_model.relations if relation.name == segment),
                None,
            )
            if relation is None:
                return False

            next_model = model_info_cache.get(relation.related_model)
            if next_model is None:
                try:
                    next_app_label, next_model_name = relation.related_model.split(".", 1)
                except ValueError:
                    return False
                next_model = SchemaDiscoveryService.get_model_by_name(
                    user,
                    next_app_label, next_model_name
                )
                if next_model is None:
                    return False
                model_info_cache[relation.related_model] = next_model

            current_model = next_model

        return False

    @classmethod
    def are_required_fields_compatible(
        cls,
        *,
        root_model: ModelInfo,
        required_fields: Iterable[str] | None,
        user=None,
        model_info_cache: dict[str, ModelInfo] | None = None,
    ) -> bool:
        normalized_required_fields = list(required_fields or [])
        if not normalized_required_fields:
            return True

        if model_info_cache is None:
            model_info_cache = {}

        for required_path in normalized_required_fields:
            if not cls.is_required_path_compatible(
                root_model=root_model,
                required_path=required_path,
                user=user,
                model_info_cache=model_info_cache,
            ):
                return False
        return True

    @classmethod
    def resolve_model_info_short(
        cls, model_ref: str | None, user=None
    ) -> ModelInfoShort | None:
        parsed = parse_model_ref(model_ref)
        if parsed is None:
            return None
        app_label, model_name = parsed

        for model_info in SchemaDiscoveryService.get_all_models(
            user=user,
            app_label=app_label,
            exclude_django=False,
        ):
            if (
                model_info.app_label == app_label
                and model_info.model_name.lower() == model_name.lower()
            ):
                return model_info
        return None

    @classmethod
    def resolve_forced_model_status(
        cls,
        *,
        target_model_ref: str | None,
        is_model_exclusive: bool,
        required_fields: Iterable[str] | None,
        user=None,
    ) -> tuple[str, ModelInfoShort | None]:
        if not is_model_exclusive:
            return FORCED_MODEL_STATUS_UNUSED, None

        parsed = parse_model_ref(target_model_ref)
        if parsed is None:
            return FORCED_MODEL_STATUS_MISSING, None

        app_label, model_name = parsed
        try:
            apps.get_model(app_label, model_name)
        except LookupError:
            return FORCED_MODEL_STATUS_STALE, None

        if not is_model_accessible_for_user(user, app_label, model_name):
            return FORCED_MODEL_STATUS_INACCESSIBLE, None

        model_info = SchemaDiscoveryService.get_model_by_name(user, app_label, model_name)
        if model_info is None:
            return FORCED_MODEL_STATUS_STALE, None

        forced_model = cls.resolve_model_info_short(target_model_ref, user=user)
        if not cls.are_required_fields_compatible(
            root_model=model_info,
            required_fields=required_fields,
            user=user,
            model_info_cache={build_model_ref(app_label, model_name): model_info},
        ):
            return FORCED_MODEL_STATUS_INCOMPATIBLE, forced_model

        return FORCED_MODEL_STATUS_OK, forced_model

    @classmethod
    def get_compatible_models(
        cls,
        *,
        required_fields: Iterable[str] | None,
        user=None,
    ) -> list[ModelInfoShort]:
        compatible_models: list[ModelInfoShort] = []
        for model_info_short in SchemaDiscoveryService.get_all_models(
            user=user,
            exclude_django=False,
        ):
            model_info = SchemaDiscoveryService.get_model_by_name(
                user,
                model_info_short.app_label,
                model_info_short.model_name,
            )
            if model_info is None:
                continue
            if cls.are_required_fields_compatible(
                root_model=model_info,
                required_fields=required_fields,
                user=user,
                model_info_cache={
                    build_model_ref(model_info_short.app_label, model_info_short.model_name): model_info
                },
            ):
                compatible_models.append(model_info_short)
        return compatible_models

    @classmethod
    def build_summary(
        cls,
        *,
        required_fields: Iterable[str] | None,
        target_model_ref: str | None,
        is_model_exclusive: bool,
        user=None,
    ) -> StyleTemplateCompatibilitySummary:
        compatible_models = cls.get_compatible_models(
            required_fields=required_fields,
            user=user,
        )
        forced_model_status, forced_model = cls.resolve_forced_model_status(
            target_model_ref=target_model_ref,
            is_model_exclusive=is_model_exclusive,
            required_fields=required_fields,
            user=user,
        )
        return StyleTemplateCompatibilitySummary(
            compatible_models=compatible_models,
            forced_model=forced_model,
            forced_model_status=forced_model_status,
        )
