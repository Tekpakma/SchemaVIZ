from __future__ import annotations

from django.apps import apps

from .generation_steps import (
    GenerationStepValidationError,
    resolve_related_model,
    validate_generation_root_model,
    validate_step_filter,
)

VISIBLE_STEP = "visible"
HIDDEN_STEP = "hidden"
STEP_VISIBILITY_CHOICES = {VISIBLE_STEP, HIDDEN_STEP}

GROUP_MODE_NONE = "none"
GROUP_MODE_GROUP = "group"
GROUP_MODE_BREAKOUT = "breakout"
STEP_GROUP_MODE_CHOICES = {
    GROUP_MODE_NONE,
    GROUP_MODE_GROUP,
    GROUP_MODE_BREAKOUT,
}


def build_model_ref(model) -> str:
    return f"{model._meta.app_label}.{model.__name__}"


def get_definition_steps_by_id(definition: dict) -> dict[str, dict]:
    value = definition.get("stepsById")
    return value if isinstance(value, dict) else {}


def get_step_visibility(step: dict) -> str:
    value = step.get("visibility", VISIBLE_STEP)
    return (
        value
        if isinstance(value, str) and value in STEP_VISIBILITY_CHOICES
        else VISIBLE_STEP
    )


def get_step_group_mode(step: dict) -> str:
    value = step.get("groupMode", GROUP_MODE_NONE)
    return (
        value
        if isinstance(value, str) and value in STEP_GROUP_MODE_CHOICES
        else GROUP_MODE_NONE
    )


def is_step_visible(step: dict) -> bool:
    return get_step_visibility(step) == VISIBLE_STEP


def is_group_step(step: dict) -> bool:
    return is_step_visible(step) and get_step_group_mode(step) == GROUP_MODE_GROUP


def breaks_out_of_group(step: dict) -> bool:
    return get_step_group_mode(step) == GROUP_MODE_BREAKOUT


def resolve_model_ref(model_ref: str, user=None):
    validate_generation_root_model(model_ref, user=user)
    app_label, model_name = model_ref.split(".")
    return apps.get_model(app_label, model_name)


def normalize_model_ref(model_ref, user=None):
    if not isinstance(model_ref, str) or not model_ref:
        return model_ref

    try:
        return build_model_ref(resolve_model_ref(model_ref, user=user))
    except GenerationStepValidationError:
        return model_ref


def normalize_generation_definition(definition: dict, user=None) -> dict:
    if not isinstance(definition, dict):
        return definition

    raw_steps_by_id = definition.get("stepsById", definition.get("steps_by_id", {}))
    steps_by_id = {}
    if isinstance(raw_steps_by_id, dict):
        for step_id, step in raw_steps_by_id.items():
            if not isinstance(step, dict):
                steps_by_id[step_id] = step
                continue

            steps_by_id[step_id] = {
                "id": step.get("id", step_id),
                "parentId": step.get("parentId", step.get("parent_id")),
                "childIds": step.get("childIds", step.get("child_ids", [])),
                "relationship": step.get("relationship"),
                "resolvedModelId": normalize_model_ref(
                    step.get("resolvedModelId", step.get("resolved_model_id")),
                    user=user,
                ),
                "visibility": step.get("visibility", VISIBLE_STEP),
                "groupMode": step.get(
                    "groupMode", step.get("group_mode", GROUP_MODE_NONE)
                ),
                "styleTemplateId": step.get(
                    "styleTemplateId", step.get("style_template_id")
                ),
                "groupTemplateId": step.get(
                    "groupTemplateId", step.get("group_template_id")
                ),
                "label": step.get("label"),
                "filter": step.get("filter"),
            }

    return {
        "rootStepId": definition.get("rootStepId", definition.get("root_step_id")),
        "stepsById": steps_by_id,
    }


def validate_generation_definition(
    root_model_ref: str, definition: dict, user=None
) -> None:
    definition = normalize_generation_definition(definition, user=user)
    root_model = resolve_model_ref(root_model_ref, user=user)
    canonical_root_model_ref = build_model_ref(root_model)

    if not isinstance(definition, dict):
        raise GenerationStepValidationError("definition must be an object.")

    root_step_id = definition.get("rootStepId")
    if not isinstance(root_step_id, str) or not root_step_id:
        raise GenerationStepValidationError("definition.rootStepId is required.")

    steps_by_id = definition.get("stepsById")
    if not isinstance(steps_by_id, dict) or not steps_by_id:
        raise GenerationStepValidationError("definition.stepsById must be an object.")

    if root_step_id not in steps_by_id:
        raise GenerationStepValidationError(
            "definition.rootStepId must reference an existing step."
        )

    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(step_id: str, current_model, *, is_root: bool) -> None:
        if step_id in visiting:
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id} participates in a cycle."
            )
        if step_id in visited:
            return

        step = steps_by_id.get(step_id)
        if not isinstance(step, dict):
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id} must be an object."
            )

        visiting.add(step_id)

        if step.get("id") not in (None, step_id):
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id}.id must match the step key."
            )

        visibility = step.get("visibility", VISIBLE_STEP)
        if visibility not in STEP_VISIBILITY_CHOICES:
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id}.visibility must be one of: "
                f"{', '.join(sorted(STEP_VISIBILITY_CHOICES))}."
            )

        group_mode = step.get("groupMode", GROUP_MODE_NONE)
        if group_mode not in STEP_GROUP_MODE_CHOICES:
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id}.groupMode must be one of: "
                f"{', '.join(sorted(STEP_GROUP_MODE_CHOICES))}."
            )

        child_ids = step.get("childIds", [])
        if not isinstance(child_ids, list):
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id}.childIds must be a list."
            )
        if len(child_ids) != len(
            {child_id for child_id in child_ids if isinstance(child_id, str)}
        ):
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id}.childIds must not contain duplicates."
            )

        resolved_model_id = step.get("resolvedModelId")
        if not isinstance(resolved_model_id, str) or not resolved_model_id:
            raise GenerationStepValidationError(
                f"definition.stepsById.{step_id}.resolvedModelId is required."
            )

        parent_id = step.get("parentId")

        if is_root:
            if parent_id not in (None, ""):
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.parentId must be null for the root step."
                )
            if step.get("relationship") not in (None, ""):
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.relationship must be empty for the root step."
                )
            if resolved_model_id != canonical_root_model_ref:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.resolvedModelId must match rootModel."
                )
            if step.get("filter") not in (None, {}):
                raise GenerationStepValidationError(
                    "Root step filters are not supported."
                )
            next_model = current_model
        else:
            if not isinstance(parent_id, str) or parent_id not in steps_by_id:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.parentId must reference an existing step."
                )
            relationship = step.get("relationship")
            if not isinstance(relationship, str) or not relationship:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.relationship is required."
                )

            expected_model = resolve_related_model(
                current_model, relationship, user=user
            )
            expected_model_ref = build_model_ref(expected_model)
            if resolved_model_id != expected_model_ref:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.resolvedModelId must be "
                    f'"{expected_model_ref}".'
                )

            try:
                validate_step_filter(expected_model, step.get("filter"))
            except GenerationStepValidationError as exc:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.filter: {exc}"
                ) from exc

            parent = steps_by_id[parent_id]
            parent_child_ids = parent.get("childIds", [])
            if step_id not in parent_child_ids:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.parentId must match the parent's childIds."
                )

            next_model = expected_model

        for child_id in child_ids:
            if not isinstance(child_id, str) or child_id not in steps_by_id:
                raise GenerationStepValidationError(
                    f"definition.stepsById.{step_id}.childIds must reference existing steps."
                )

            child = steps_by_id[child_id]
            if child.get("parentId") != step_id:
                raise GenerationStepValidationError(
                    f'definition.stepsById.{child_id}.parentId must equal "{step_id}".'
                )

            visit(child_id, next_model, is_root=False)

        visiting.remove(step_id)
        visited.add(step_id)

    visit(root_step_id, root_model, is_root=True)

    unreachable = sorted(step_id for step_id in steps_by_id if step_id not in visited)
    if unreachable:
        raise GenerationStepValidationError(
            "definition.stepsById contains unreachable steps: "
            + ", ".join(unreachable)
            + "."
        )
