"""
Execution engine for GenerationTemplates.

Takes a normalized generation definition plus a root model and walks Django
relationships to produce React Flow-compatible nodes and edges. Hidden steps
are traversed but not rendered; their visible descendants connect back to the
nearest visible ancestor.
"""

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
from .generation_types import (  # noqa: F401 — re-exported for existing importers
    GeneratedEdge,
    GeneratedNode,
    GenerationResult,
    GenerationResultSerializer,
)
from .lexical_paths import collect_data_reference_paths, has_relation_segment
from .qlab_access import is_model_accessible_for_user
from .relation_resolution import (
    build_prefetch_plan,
    resolve_relation_paths,
)


class GenerationEngine:
    """
    Walks a normalized generation graph against live data.

    Usage:
        engine = GenerationEngine(root_model="app.Model", definition=definition)
        result = engine.execute(record_pk="42")
    """

    def __init__(
        self,
        *,
        root_model: str,
        definition: dict,
        user=None,
        layout_settings: dict | None = None,
    ):
        self.root_model = root_model
        self.definition = definition
        self.layout_settings = layout_settings or {}
        self.user = user
        self.root_step_id = str(definition["rootStepId"])
        self.steps_by_id = get_definition_steps_by_id(definition)
        self._seen_keys: set[str] = set()  # dedup: "app_label.Model:pk"
        self._seen_edge_keys: set[tuple[str, str, str]] = set()
        self._nodes_by_id: dict[str, GeneratedNode] = {}
        self._step_filter_cache: dict[tuple[str, str], object] = {}
        # Relation paths referenced by step text content (lexical state),
        # grouped by the model the path is resolved against. Drives both
        # prefetch planning and per-record resolution. Populated lazily on
        # first use because building it touches the StyleTemplate /
        # GroupTemplate tables, and structure-preview runs don't need it.
        self._referenced_paths_by_model: dict[str, set[str]] | None = None

    @classmethod
    def from_template(cls, template, *, user=None):
        version = template.published_version or template.draft_version
        layout_settings = getattr(version, "layout_settings", None) if version else None
        return cls(
            root_model=template.root_model,
            definition=template.steps,
            user=user,
            layout_settings=layout_settings,
        )

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
            root_record = self._build_queryset_with_prefetch(
                model, self.root_model
            ).get(pk=record_pk)
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
            # Resolve any relation paths (``templates.name`` style) referenced
            # in this step's lexical content so the frontend renderer can walk
            # the nested data without a follow-up round trip.
            model_id = build_model_ref(model)
            relation_paths = self._relation_paths_for_model(model_id)
            if relation_paths:
                resolved = resolve_relation_paths(
                    record,
                    relation_paths,
                    user=self.user,
                    accessibility_check=is_model_accessible_for_user,
                )
                fields_data.update(resolved)
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

        # Apply select_related / prefetch_related once per traversal hop so
        # downstream relation-path resolution doesn't trigger N+1 queries.
        related_model_ref = build_model_ref(related_model)
        related_queryset = self._apply_prefetch(related_queryset, related_model_ref)

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

    # ------------------------------------------------------------------
    # Relation-path discovery & prefetch (lexical-driven)
    # ------------------------------------------------------------------

    def _relation_paths_for_model(self, model_ref: str) -> set[str]:
        """Paths containing a dot that are referenced for the given model."""
        if self._referenced_paths_by_model is None:
            self._referenced_paths_by_model = self._collect_referenced_paths()
        paths = self._referenced_paths_by_model.get(model_ref, set())
        return {p for p in paths if has_relation_segment(p)}

    def _build_queryset_with_prefetch(
        self, model: type[models.Model], model_ref: str
    ) -> models.QuerySet:
        """Root-record queryset with select/prefetch applied."""
        return self._apply_prefetch(model._default_manager.all(), model_ref)

    def _apply_prefetch(
        self, queryset: models.QuerySet, model_ref: str
    ) -> models.QuerySet:
        paths = self._relation_paths_for_model(model_ref)
        if not paths:
            return queryset
        select_related, prefetch_related = build_prefetch_plan(queryset.model, paths)
        if select_related:
            queryset = queryset.select_related(*select_related)
        if prefetch_related:
            queryset = queryset.prefetch_related(*prefetch_related)
        return queryset

    def _collect_referenced_paths(self) -> dict[str, set[str]]:
        """
        Walk every step's lexical content once and group discovered
        ``data-reference`` paths by the model they're resolved against.

        Three sources are inspected, in priority order:

          1. ``layout_settings.styleDrafts[stepId].textContent`` — in-flight
             draft edits from the builder. These supersede the saved template
             so live preview reflects the current chip state.
          2. ``StyleTemplate.text_content`` — referenced via ``styleTemplateId``.
             Bulk-fetched in one query.
          3. ``GroupTemplate.text_content`` — referenced via ``groupTemplateId``.
             Bulk-fetched in one query.

        Steps with a draft override skip the StyleTemplate fetch entirely.
        """
        # Lazy imports — avoid a circular import via apps registry warm-up.
        from ..models import GroupTemplate, StyleTemplate

        style_drafts_by_step = self._read_style_drafts()

        style_ids: set[str] = set()
        group_ids: set[str] = set()
        steps_by_style: dict[str, list[dict]] = {}
        steps_by_group: dict[str, list[dict]] = {}
        steps_with_draft_states: list[tuple[dict, object]] = []

        for step_id, step in self.steps_by_id.items():
            if not isinstance(step, dict):
                continue

            draft_state = style_drafts_by_step.get(step_id)
            if draft_state is not None:
                steps_with_draft_states.append((step, draft_state))
            else:
                style_id = step.get("style_template_id") or step.get("styleTemplateId")
                if isinstance(style_id, str) and style_id:
                    style_ids.add(style_id)
                    steps_by_style.setdefault(style_id, []).append(step)

            group_id = step.get("group_template_id") or step.get("groupTemplateId")
            if isinstance(group_id, str) and group_id:
                group_ids.add(group_id)
                steps_by_group.setdefault(group_id, []).append(step)

        style_states: dict[str, object] = {}
        if style_ids:
            for row in StyleTemplate.objects.filter(id__in=style_ids).only(
                "id", "text_content"
            ):
                style_states[str(row.id)] = row.text_content
        group_states: dict[str, object] = {}
        if group_ids:
            for row in GroupTemplate.objects.filter(id__in=group_ids).only(
                "id", "text_content"
            ):
                group_states[str(row.id)] = row.text_content

        paths_by_model: dict[str, set[str]] = {}

        def _attach(step: dict, state: object) -> None:
            model_ref = step.get("resolvedModelId") or step.get("resolved_model_id")
            if not isinstance(model_ref, str) or not model_ref:
                return
            paths = collect_data_reference_paths(state)
            if not paths:
                return
            paths_by_model.setdefault(model_ref, set()).update(paths)

        for step, draft_state in steps_with_draft_states:
            _attach(step, draft_state)

        for style_id, steps in steps_by_style.items():
            state = style_states.get(style_id)
            if state is None:
                continue
            for step in steps:
                _attach(step, state)

        for group_id, steps in steps_by_group.items():
            state = group_states.get(group_id)
            if state is None:
                continue
            for step in steps:
                _attach(step, state)

        return paths_by_model

    def _read_style_drafts(self) -> dict[str, object]:
        """
        Extract ``{step_id: text_content}`` from ``layout_settings.styleDrafts``.

        Accepts both camelCase (``styleDrafts``/``textContent``) and snake_case
        (``style_drafts``/``text_content``) since the request may travel
        through CamelCaseJSONParser or arrive raw from a stored template
        version.
        """
        layout = self.layout_settings or {}
        drafts = layout.get("styleDrafts") or layout.get("style_drafts")
        if not isinstance(drafts, dict):
            return {}
        result: dict[str, object] = {}
        for step_id, draft in drafts.items():
            if not isinstance(draft, dict):
                continue
            text_content = draft.get("textContent")
            if text_content is None:
                text_content = draft.get("text_content")
            if text_content is None:
                continue
            result[str(step_id)] = text_content
        return result

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
