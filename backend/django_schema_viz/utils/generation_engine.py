"""
Execution engine for GenerationTemplates.

Takes a normalized generation definition plus a root model and walks Django
relationships to produce React Flow-compatible nodes and edges. Hidden steps
are traversed but not rendered; their visible descendants connect back to the
nearest visible ancestor.
"""

from dataclasses import dataclass, field
from typing import Any

from django.apps import apps
from django.db import models

from ..serializers import DynamicModelSerializer
from .generation_definition import (
    GROUP_MODE_BREAKOUT,
    build_model_ref,
    breaks_out_of_group,
    get_definition_steps_by_id,
    get_step_group_mode,
    is_group_step,
    is_step_visible,
)
from .generation_steps import build_step_filter
from .generation_steps import GenerationStepValidationError
from .qlab_access import is_model_accessible_for_user
from rest_framework_dataclasses.serializers import DataclassSerializer


@dataclass
class GeneratedNode:
    """A single node in the generated diagram."""

    id: str
    app_label: str
    model_name: str
    record_pk: str
    label: str | None
    display_name: str
    fields: dict[str, Any]
    style_template_id: str | None
    group_template_id: str | None = None
    parent_id: str | None = None
    is_group: bool = False
    step_ui_ids: list[str] = field(default_factory=list)


@dataclass
class GeneratedEdge:
    """An edge connecting two visible nodes."""

    source: str
    target: str
    relationship: str  # the original relationship name that caused this edge


@dataclass
class GenerationResult:
    """Complete output of a template execution."""

    nodes: list[GeneratedNode] = field(default_factory=list)
    edges: list[GeneratedEdge] = field(default_factory=list)


class GenerationResultSerializer(DataclassSerializer):
    """Complete output of a template execution."""

    class Meta:
        dataclass = GenerationResult


class GenerationEngine:
    """
    Walks a normalized generation graph against live data.

    Usage:
        engine = GenerationEngine(root_model="app.Model", definition=definition)
        result = engine.execute(record_pk="42")
    """

    def __init__(self, *, root_model: str, definition: dict, user=None):
        self.root_model = root_model
        self.definition = definition
        self.user = user
        self.root_step_id = str(definition["rootStepId"])
        self.steps_by_id = get_definition_steps_by_id(definition)
        self._seen_keys: set[str] = set()  # dedup: "app_label.Model:pk"
        self._seen_edge_keys: set[tuple[str, str, str]] = set()
        self._nodes_by_id: dict[str, GeneratedNode] = {}
        self._step_filter_cache: dict[tuple[str, str], object] = {}

    @classmethod
    def from_template(cls, template, *, user=None):
        return cls(root_model=template.root_model, definition=template.steps, user=user)

    def execute(self, record_pk: str) -> GenerationResult:
        """Execute the template starting from the given record PK."""
        self._seen_keys.clear()
        self._seen_edge_keys.clear()
        self._nodes_by_id.clear()
        app_label, model_name = self.root_model.split(".")
        if not is_model_accessible_for_user(self.user, app_label, model_name):
            raise GenerationStepValidationError(
                f'Model "{self.root_model}" is not accessible.'
            )
        model = apps.get_model(app_label, model_name)

        try:
            root_record = model.objects.get(pk=record_pk)
        except model.DoesNotExist:
            raise ValueError(
                f"Record with pk={record_pk} not found for {self.root_model}"
            )

        result = GenerationResult()
        self._process_step(
            step_id=self.root_step_id,
            record=root_record,
            model=model,
            visible_ancestor_id=None,
            group_ancestor_id=None,
            result=result,
        )

        return result

    def preview_structure(self) -> GenerationResult:
        self._seen_keys.clear()
        self._seen_edge_keys.clear()
        self._nodes_by_id.clear()
        app_label, model_name = self.root_model.split(".")
        if not is_model_accessible_for_user(self.user, app_label, model_name):
            raise GenerationStepValidationError(
                f'Model "{self.root_model}" is not accessible.'
            )
        root_model = apps.get_model(app_label, model_name)
        result = GenerationResult()

        self._process_structure_step(
            step_id=self.root_step_id,
            model=root_model,
            visible_ancestor_id=None,
            group_ancestor_id=None,
            result=result,
        )
        return result

    def _process_step(
        self,
        step_id: str,
        record: models.Model,
        model: type[models.Model],
        visible_ancestor_id: str | None,
        group_ancestor_id: str | None,
        result: GenerationResult,
    ) -> None:
        """
        Process a single step in the traversal tree.

        If the step is visible, creates a node and an edge from the
        nearest visible ancestor. Then recurses into children.
        If hidden, passes the current visible ancestor through unchanged.
        """
        step = self.steps_by_id[step_id]
        app_label = model._meta.app_label
        model_name = model._meta.model_name or ""
        if not is_model_accessible_for_user(self.user, app_label, model_name):
            return
        record_pk = str(record.pk)

        is_visible = is_step_visible(step)
        is_group = is_group_step(step)
        break_out_of_group = breaks_out_of_group(step)
        effective_group_ancestor_id = None if break_out_of_group else group_ancestor_id

        # Dedup — avoid processing the same record twice in the same grouping context.
        dedup_key = f"{app_label}.{model_name}:{record_pk}@{effective_group_ancestor_id or 'root'}:{'group' if is_group else 'node'}"
        # Build node ID (stable, unique within the result).
        # Keep legacy IDs for ungrouped nodes, but namespace grouped-context
        # nodes so the same record can appear in multiple groups safely.
        base_node_id = f"{app_label}.{model_name}:{record_pk}"
        node_id = (
            base_node_id
            if effective_group_ancestor_id is None and not is_group
            else f"{base_node_id}@{effective_group_ancestor_id or 'root'}:{'group' if is_group else 'node'}"
        )

        if dedup_key in self._seen_keys:
            existing_node = self._nodes_by_id.get(node_id)
            step_was_added = self._ensure_step_ui_id(existing_node, step_id)

            if is_visible:
                self._append_edge_once(
                    source=visible_ancestor_id,
                    target=node_id,
                    relationship=step.get("relationship") or "",
                    result=result,
                )
                if not step_was_added:
                    return
            else:
                for child_step_id in step.get("childIds", []):
                    self._follow_relationship(
                        child_step_id=child_step_id,
                        parent_record=record,
                        parent_model=model,
                        visible_ancestor_id=visible_ancestor_id,
                        group_ancestor_id=effective_group_ancestor_id,
                        result=result,
                    )
                return

            current_ancestor = node_id
            current_group_ancestor = (
                node_id if is_group else effective_group_ancestor_id
            )
            for child_step_id in step.get("childIds", []):
                self._follow_relationship(
                    child_step_id=child_step_id,
                    parent_record=record,
                    parent_model=model,
                    visible_ancestor_id=current_ancestor,
                    group_ancestor_id=current_group_ancestor,
                    result=result,
                )
            return
        self._seen_keys.add(dedup_key)

        current_ancestor = visible_ancestor_id
        current_group_ancestor = effective_group_ancestor_id

        if is_visible:
            # Serialize the record
            serializer_class = DynamicModelSerializer.for_model(model)
            fields_data = dict(serializer_class(record).data)
            style_template_id = step.get(
                "style_template_id", step.get("styleTemplateId")
            )
            group_template_id = step.get(
                "group_template_id", step.get("groupTemplateId")
            )

            node = GeneratedNode(
                id=node_id,
                app_label=app_label,
                model_name=model_name,
                record_pk=record_pk,
                label=step.get("label"),
                display_name=str(record),
                fields=fields_data,
                style_template_id=style_template_id,
                group_template_id=group_template_id,
                parent_id=effective_group_ancestor_id,
                is_group=is_group,
                step_ui_ids=[step_id],
            )
            result.nodes.append(node)
            self._nodes_by_id[node_id] = node

            # Edge from ancestor (skip for root which has no ancestor)
            self._append_edge_once(
                source=visible_ancestor_id,
                target=node_id,
                relationship=step.get("relationship") or "",
                result=result,
            )

            # This node becomes the ancestor for its children
            current_ancestor = node_id
            if is_group:
                current_group_ancestor = node_id

        # Recurse into children
        for child_step_id in step.get("childIds", []):
            self._follow_relationship(
                child_step_id=child_step_id,
                parent_record=record,
                parent_model=model,
                visible_ancestor_id=current_ancestor,
                group_ancestor_id=current_group_ancestor,
                result=result,
            )

    def _append_edge_once(
        self,
        *,
        source: str | None,
        target: str,
        relationship: str,
        result: GenerationResult,
    ) -> None:
        if source is None:
            return

        edge_key = (source, target, relationship)
        if edge_key in self._seen_edge_keys:
            return
        self._seen_edge_keys.add(edge_key)
        result.edges.append(
            GeneratedEdge(
                source=source,
                target=target,
                relationship=relationship,
            )
        )

    @staticmethod
    def _ensure_step_ui_id(node: GeneratedNode | None, step_id: str) -> bool:
        if node is None or step_id in node.step_ui_ids:
            return False

        node.step_ui_ids.append(step_id)
        return True

    def _follow_relationship(
        self,
        child_step_id: str,
        parent_record: models.Model,
        parent_model: type[models.Model],
        visible_ancestor_id: str | None,
        group_ancestor_id: str | None,
        result: GenerationResult,
    ) -> None:
        """
        Resolve a relationship from a parent record and process the
        resulting record(s) through the child step.

        Handles forward FK/O2O (single record), reverse FK/O2O (queryset),
        and M2M (queryset) relationships.
        """
        child_step = self.steps_by_id[child_step_id]
        relationship_name = child_step.get("relationship")
        if not relationship_name:
            return

        # Try to get the related object(s) via the relationship name
        try:
            related = getattr(parent_record, relationship_name)
        except AttributeError:
            # Relationship doesn't exist on this model — skip silently
            return

        related_model: type[models.Model] | None
        related_queryset: models.QuerySet | None

        if isinstance(related, models.Manager):
            related_queryset = related.all()
            related_model = related_queryset.model
        elif related is not None:
            related_model = type(related)
            related_queryset = related_model._default_manager.filter(pk=related.pk)
        else:
            return

        if related_model is None or related_queryset is None:
            return

        q_object = self._get_step_filter_q(child_step, related_model)
        if q_object is not None:
            related_queryset = related_queryset.filter(q_object)

        for record in related_queryset:
            self._process_step(
                step_id=child_step_id,
                record=record,
                model=related_model,
                visible_ancestor_id=visible_ancestor_id,
                group_ancestor_id=group_ancestor_id,
                result=result,
            )

    def _get_step_filter_q(self, step: dict, model: type[models.Model]):
        cache_key = (str(step.get("id") or ""), model._meta.label_lower)
        if cache_key in self._step_filter_cache:
            return self._step_filter_cache[cache_key]

        validated = build_step_filter(model, step)
        self._step_filter_cache[cache_key] = validated.q_object
        return validated.q_object

    def _process_structure_step(
        self,
        *,
        step_id: str,
        model,
        visible_ancestor_id: str | None,
        group_ancestor_id: str | None,
        result: GenerationResult,
    ) -> None:
        step = self.steps_by_id[step_id]
        model_ref = build_model_ref(model)
        app_label = model._meta.app_label
        model_name = model._meta.model_name or ""
        if not is_model_accessible_for_user(self.user, app_label, model_name):
            return

        is_visible = is_step_visible(step)
        is_group = is_group_step(step)
        break_out_of_group = breaks_out_of_group(step)
        effective_group_ancestor_id = None if break_out_of_group else group_ancestor_id

        current_ancestor = visible_ancestor_id
        current_group_ancestor = effective_group_ancestor_id
        structure_node_id = f"struct:{step_id}"

        if is_visible:
            label = step.get("label") or step.get("relationship") or model.__name__
            result.nodes.append(
                GeneratedNode(
                    id=structure_node_id,
                    app_label=app_label,
                    model_name=model_name,
                    record_pk="",
                    label=label,
                    display_name=model_ref,
                    fields={},
                    style_template_id=step.get("styleTemplateId"),
                    group_template_id=step.get("groupTemplateId"),
                    parent_id=effective_group_ancestor_id,
                    is_group=is_group,
                    step_ui_ids=[step_id],
                )
            )

            if visible_ancestor_id is not None:
                result.edges.append(
                    GeneratedEdge(
                        source=visible_ancestor_id,
                        target=structure_node_id,
                        relationship=step.get("relationship") or "",
                    )
                )

            current_ancestor = structure_node_id
            if is_group:
                current_group_ancestor = structure_node_id

        for child_step_id in step.get("childIds", []):
            child_step = self.steps_by_id[child_step_id]
            relationship_name = child_step.get("relationship")
            if not relationship_name:
                continue
            related_model = child_step.get("resolvedModelId")
            if isinstance(related_model, str) and related_model:
                app_label, object_name = related_model.split(".", 1)
                next_model = apps.get_model(app_label, object_name)
            else:
                next_model = apps.get_model(
                    *build_model_ref(
                        resolve_related_model(
                            model,
                            relationship_name,
                            user=self.user,
                        )
                    ).split(".", 1)
                )
            self._process_structure_step(
                step_id=child_step_id,
                model=next_model,
                visible_ancestor_id=current_ancestor,
                group_ancestor_id=current_group_ancestor,
                result=result,
            )
