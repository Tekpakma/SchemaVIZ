from __future__ import annotations

from dataclasses import dataclass

from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.db.models import Q
from django.db.models.fields.related import ManyToManyRel, ManyToOneRel, OneToOneRel
from qlab.helpers import build_q
from qlab.model_validation import ValidationError
from qlab.pydantic_filters import QueryFilter

from .qlab_access import is_model_accessible_for_user


class GenerationStepValidationError(ValueError):
    """Raised when a generation step tree or filter definition is invalid."""


def get_step_value(step: dict, *names: str, default=None):
    for name in names:
        if name in step:
            return step[name]
    return default


def get_step_filter_fields(step: dict) -> dict | None:
    value = get_step_value(step, "filter", "filter_fields", "filterFields")
    if value in (None, {}):
        return None
    return value


def get_step_ui_id(step: dict) -> str | None:
    value = get_step_value(step, "ui_id", "uiId")
    if value in (None, ""):
        return None
    return str(value)


def validate_generation_root_model(value: str, user=None) -> str:
    try:
        app_label, model_name = value.split(".")
    except ValueError as exc:
        raise GenerationStepValidationError(
            'Must be in "app_label.ModelName" format, e.g. "infrastructure.Server".'
        ) from exc

    if not is_model_accessible_for_user(user, app_label, model_name):
        raise GenerationStepValidationError(f'Model "{value}" is not accessible.')

    try:
        apps.get_model(app_label, model_name)
    except LookupError as exc:
        raise GenerationStepValidationError(f'Model "{value}" does not exist.') from exc

    return value


def resolve_model_ref(model_ref: str, user=None):
    validate_generation_root_model(model_ref, user=user)
    app_label, model_name = model_ref.split(".")
    return apps.get_model(app_label, model_name)


def resolve_related_model(parent_model, relationship_name: str, user=None):
    try:
        field = parent_model._meta.get_field(relationship_name)
    except FieldDoesNotExist:
        field = None
        for candidate in parent_model._meta.get_fields():
            if not isinstance(candidate, (ManyToOneRel, ManyToManyRel, OneToOneRel)):
                continue
            accessor = candidate.get_accessor_name()
            if accessor == relationship_name:
                field = candidate
                break

    if field is None or not getattr(field, "related_model", None):
        raise GenerationStepValidationError(
            f'Relationship "{relationship_name}" does not exist on {parent_model._meta.label}.'
        )

    related_model = field.related_model
    if not is_model_accessible_for_user(
        user,
        related_model._meta.app_label, related_model._meta.model_name
    ):
        raise GenerationStepValidationError(
            f'Model "{related_model._meta.label}" is not accessible.'
        )
    return related_model


@dataclass(slots=True)
class ValidatedStepFilter:
    filter_fields: object | None
    q_object: Q | None


def _format_filter_errors(exc: ValidationError) -> str:
    payload = exc.errors()
    parts: list[str] = []
    for item in payload.get("errors", []):
        location = ".".join(item.get("loc", []))
        message = item.get("msg", "Invalid filter.")
        parts.append(f"{location}: {message}" if location else message)
    return "; ".join(parts) or "Invalid filter."


def validate_step_filter(model, filter_fields: dict | None) -> object | None:
    if not filter_fields:
        return None

    normalized_filter_fields = normalize_filter_fields(filter_fields)

    try:
        query = QueryFilter(
            model=model.__name__,
            app_label=model._meta.app_label,
            select_fields=[model._meta.pk.name],
            filter_fields=normalized_filter_fields,
            page=1,
        )
    except ValidationError as exc:
        raise GenerationStepValidationError(_format_filter_errors(exc)) from exc

    return query.filter_fields


def build_step_filter(model, step: dict) -> ValidatedStepFilter:
    validated_filter = validate_step_filter(model, get_step_filter_fields(step))
    return ValidatedStepFilter(
        filter_fields=validated_filter,
        q_object=build_q(validated_filter) if validated_filter else None,
    )


def validate_generation_steps(root_model_ref: str, steps: dict, user=None) -> None:
    root_model = resolve_model_ref(root_model_ref, user=user)
    if not isinstance(steps, dict):
        raise GenerationStepValidationError("steps must be an object.")

    def visit(step: dict, current_model, *, is_root: bool, path: tuple[int, ...]) -> None:
        if not isinstance(step, dict):
            raise GenerationStepValidationError(
                f"{_format_step_path(path)} must be an object."
            )

        children = get_step_value(step, "children", default=[])
        if children is None:
            children = []
        if not isinstance(children, list):
            raise GenerationStepValidationError(
                f"{_format_step_path(path)}.children must be a list."
            )

        if is_root:
            if get_step_filter_fields(step):
                raise GenerationStepValidationError(
                    "steps.filterFields is only supported on child steps."
                )
            next_model = current_model
        else:
            relationship_name = get_step_value(step, "relationship")
            if not relationship_name or not isinstance(relationship_name, str):
                raise GenerationStepValidationError(
                    f"{_format_step_path(path)}.relationship is required."
                )
            try:
                next_model = resolve_related_model(
                    current_model, relationship_name, user=user
                )
            except GenerationStepValidationError as exc:
                raise GenerationStepValidationError(
                    f"{_format_step_path(path)}: {exc}"
                ) from exc

            try:
                validate_step_filter(next_model, get_step_filter_fields(step))
            except GenerationStepValidationError as exc:
                raise GenerationStepValidationError(
                    f"{_format_step_path(path)}.filterFields: {exc}"
                ) from exc

        for index, child in enumerate(children):
            visit(child, next_model, is_root=False, path=(*path, index))

    visit(steps, root_model, is_root=True, path=())


def _format_step_path(path: tuple[int, ...]) -> str:
    if not path:
        return "steps"
    suffix = "".join(f".children[{index}]" for index in path)
    return f"steps{suffix}"


def normalize_filter_fields(value):
    if isinstance(value, list):
        return [normalize_filter_fields(item) for item in value]
    if not isinstance(value, dict):
        return value

    normalized: dict = {}
    for key, item in value.items():
        normalized_key = {
            "andOperation": "and_operation",
            "orOperation": "or_operation",
            "notOperation": "not_operation",
        }.get(key, key)
        normalized[normalized_key] = normalize_filter_fields(item)
    return normalized
