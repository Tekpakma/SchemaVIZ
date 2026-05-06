from django import apps
from django.db import models
from django.db.models.fields.related import (
    ForeignKey,
    ManyToManyField,
    OneToOneField,
    ManyToOneRel,
    ManyToManyRel,
    OneToOneRel,
)
from typing import Any
from dataclasses import dataclass
import hashlib
import json
from rest_framework_dataclasses.serializers import DataclassSerializer
from collections import deque

from .qlab_access import (
    get_accessible_models_for_user,
    is_model_accessible_for_user,
)


@dataclass(frozen=True, order=True)
class SchemaNode:
    """Node reprensenting a schema"""

    id: str
    name: str
    group: str
    is_proxy: bool
    is_abstract: bool
    primary_key: str
    app_label: str
    model_name: str
    fields: frozenset[tuple[str, str]]

    @classmethod
    def from_model(cls, model: type[models.Model]) -> "SchemaNode":
        """Create a SchemaNode from a Django model."""
        # Get the fields from the model
        fields = frozenset(
            (field.name, field.__class__.__name__) for field in model._meta.get_fields()
        )
        app_label, model_name = SchemaDiscoveryService._get_app_and_model_name(model)
        return cls(
            id=SchemaDiscoveryService._get_model_id(model),
            name=model.__name__,
            app_label=app_label,
            model_name=model_name,
            group=SchemaDiscoveryService._get_app_name(model),
            is_proxy=model._meta.proxy,
            is_abstract=model._meta.abstract,
            primary_key=model._meta.pk.name if model._meta.pk else "",
            fields=fields,
        )


class SchemaNodeSerializer(DataclassSerializer):
    class Meta:
        dataclass = SchemaNode


@dataclass(frozen=True, order=True)
class SchemaEdge:
    """Edge representing a schema"""

    source: str
    target: str
    source_field: str = ""  # Field name on source model
    target_field: str = ""  # Field name on target model (typically primary key)
    reverse_name: str = ""  # Name of the reverse relation, if applicable
    is_proxy: bool = False
    is_subclass: bool = False
    is_foreign_key: bool = False
    is_one_to_one: bool = False
    is_many_to_many: bool = False

    @classmethod
    def proxy(
        cls, child: type[models.Model], parent: type[models.Model]
    ) -> "SchemaEdge":
        return cls(
            SchemaDiscoveryService._get_model_id(child),
            SchemaDiscoveryService._get_model_id(parent),
            is_proxy=True,
        )

    @classmethod
    def subclass(
        cls, child: type[models.Model], parent: type[models.Model]
    ) -> "SchemaEdge":
        return cls(
            SchemaDiscoveryService._get_model_id(child),
            SchemaDiscoveryService._get_model_id(parent),
            is_subclass=True,
        )

    @classmethod
    def from_field(
        cls, model: type[models.Model], field: type[models.fields.Field]
    ) -> "SchemaEdge | None":
        # Ignore non-relation fields
        if not field.is_relation:
            return None
        # Skip fields defined on superclasses
        if field.model != model:
            return None
        related_model = field.related_model
        # GenericForeignKey
        if related_model is None:
            return None
        model_id = SchemaDiscoveryService._get_model_id(model)
        related_model_id = SchemaDiscoveryService._get_model_id(related_model)

        # Get the field name from the source model
        source_field = field.name

        # Get the target field (typically primary key)
        # For ForeignKey and OneToOne, this is the field referred to by to_field
        # or the primary key by default
        target_field = ""
        if hasattr(field, "to_field") and field.to_field:
            target_field = field.to_field
        else:
            # Default to primary key
            target_field = related_model._meta.pk.name
        reverse_name = ""
        if hasattr(field, "remote_field") and field.remote_field:
            get_accessor_name = getattr(field.remote_field, "get_accessor_name", None)
            if callable(get_accessor_name):
                reverse_name = get_accessor_name() or ""
            else:
                reverse_name = field.remote_field.name or ""
        # Foreign key
        if field.many_to_one:
            return cls(
                model_id,
                related_model_id,
                reverse_name=reverse_name,
                source_field=source_field,
                target_field=target_field,
                is_foreign_key=True,
            )
        # One to one
        elif field.one_to_one and not field.auto_created:
            return cls(
                model_id,
                related_model_id,
                reverse_name=reverse_name,
                source_field=source_field,
                target_field=target_field,
                is_one_to_one=True,
            )
        # Many-to-many
        elif field.many_to_many and not field.auto_created:
            through_model = getattr(model, field.name).through
            # We only add the M2M connection if the through-model is auto-created.
            # This stops us from creating two sets of connections (because the
            # connections will be created by the FK fields on the through model).
            if through_model._meta.auto_created:
                return cls(
                    model_id,
                    related_model_id,
                    reverse_name=reverse_name,
                    source_field=source_field,
                    target_field=target_field,
                    is_many_to_many=True,
                )


class SchemaEdgeSerializer(DataclassSerializer):
    class Meta:
        dataclass = SchemaEdge


@dataclass(frozen=True, order=True)
class SchemaGroup:
    id: str
    name: str

    @classmethod
    def from_model(cls, model: type[models.Model]) -> "SchemaGroup":
        return cls(
            id=SchemaDiscoveryService._get_app_name(model),
            name=SchemaDiscoveryService._get_app_name(model),
        )


class SchemaGroupSerializer(DataclassSerializer):
    class Meta:
        dataclass = SchemaGroup


@dataclass(frozen=True)
class SchemaGraph:
    schema_hash: str
    nodes: tuple["SchemaNode", ...]
    edges: tuple["SchemaEdge", ...]
    groups: tuple["SchemaGroup", ...]


class SchemaGraphSerializer(DataclassSerializer):
    class Meta:
        dataclass = SchemaGraph


@dataclass(frozen=True)
class RelationInfo:
    name: str
    type: str
    related_model: str
    related_name: str
    help_text: str | None = None
    verbose_name: str | None = None
    on_delete: str | None = None
    verbose_name: str | None = None
    help_text: str | None = None
    reverse: bool = False


@dataclass(frozen=True)
class FieldInfo:
    name: str
    type: str
    verbose_name: str | None = None
    help_text: str | None = None
    primary_key: bool = False
    null: bool = False
    blank: bool = False
    max_length: int | None = None
    choices: list[dict[str, Any]] | None = None


@dataclass(frozen=True)
class MethodInfo:
    name: str
    doc: str | None = None
    signature: str | None = None


@dataclass(frozen=True)
class ModelInfoShort:
    app_label: str
    app_verbose_name: str
    model_name: str
    verbose_name: str
    verbose_name_plural: str
    abstract: bool
    db_table: str
    managed: bool


@dataclass(frozen=True)
class ModelInfo(ModelInfoShort):
    fields: list[FieldInfo]
    relations: list[RelationInfo]
    methods: list[MethodInfo]


class ModelInfoSerializer(DataclassSerializer):
    class Meta:
        dataclass = ModelInfo


class ModelInfoShortSerializer(DataclassSerializer):
    class Meta:
        dataclass = ModelInfoShort


@dataclass(frozen=True)
class PathStep:
    """Represents a single hop between two models in a path."""

    source_model_id: str
    target_model_id: str
    edge: SchemaEdge
    is_forward: bool  # True if following the edge source->target, False if reverse


@dataclass(frozen=True)
class SchemaPath:
    """The complete path from start to end model."""

    start_model_id: str
    end_model_id: str
    steps: list[PathStep]
    waypoints: list[str]

    @property
    def total_length(self) -> int:
        return len(self.steps)


@dataclass(frozen=True)
class RouteStep:
    from_model: str
    to_model: str
    via_field: str
    is_forward: bool
    is_many: bool


@dataclass(frozen=True)
class SchemaRoute:
    start_model: str
    end_model: str
    route: list[RouteStep]
    waypoints: list[str]


class SchemaRouteSerializer(DataclassSerializer):
    class Meta:
        dataclass = SchemaRoute


class SchemaDiscoveryService:
    """
    Service for discovering schema information from Django models.
    Only exposes models explicitly allowed in the configuration whitelist.
    """

    @staticmethod
    def _get_app_and_model_name(model: type[models.Model]) -> tuple[str, str]:
        """Get the app label and model name for a given model."""
        return model._meta.app_label, model._meta.model_name or ""

    @staticmethod
    def _get_app_name(model: type[models.Model]) -> str:
        """Get the app name for a given model."""
        app_label = model._meta.app_label
        try:
            return apps.apps.get_app_config(app_label).name
        except LookupError:
            return model.__module__

    @staticmethod
    def _get_model_id(model: type[models.Model]) -> str:
        """Get the model ID for a given model."""
        return f"{model._meta.app_label}.{model.__name__}"

    @staticmethod
    def _is_model_subclass(obj: type[models.Model]) -> bool:
        """Check if an object is a subclass of models.Model."""
        if obj is models.Model:
            return False
        return issubclass(obj, models.Model)

    @classmethod
    def _get_model_basic_info(cls, model: type[models.Model]) -> dict[str, Any]:
        """Get basic information about a model."""
        return {
            "group": cls._get_app_name(model),
            "app_label": model._meta.app_label,
            "model_name": model._meta.model_name,
            "is_abstract": model._meta.abstract,
            "is_proxy": model._meta.proxy,
            "verbose_name": str(model._meta.verbose_name),
        }

    @staticmethod
    def _build_schema_hash(
        nodes: tuple["SchemaNode", ...],
        edges: tuple["SchemaEdge", ...],
        groups: tuple["SchemaGroup", ...],
    ) -> str:
        payload = {
            "nodes": [
                {
                    "id": node.id,
                    "name": node.name,
                    "group": node.group,
                    "is_proxy": node.is_proxy,
                    "is_abstract": node.is_abstract,
                    "primary_key": node.primary_key,
                    "app_label": node.app_label,
                    "model_name": node.model_name,
                    "fields": sorted(node.fields),
                }
                for node in nodes
            ],
            "edges": [
                {
                    "source": edge.source,
                    "target": edge.target,
                    "source_field": edge.source_field,
                    "target_field": edge.target_field,
                    "reverse_name": edge.reverse_name,
                    "is_proxy": edge.is_proxy,
                    "is_subclass": edge.is_subclass,
                    "is_foreign_key": edge.is_foreign_key,
                    "is_one_to_one": edge.is_one_to_one,
                    "is_many_to_many": edge.is_many_to_many,
                }
                for edge in edges
            ],
            "groups": [
                {
                    "id": group.id,
                    "name": group.name,
                }
                for group in groups
            ],
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
        return hashlib.sha256(encoded).hexdigest()

    @classmethod
    def get_schema(cls, user=None) -> "SchemaGraph":
        """Get the schema graph for all accessible models."""
        nodes = set()
        edges = set()
        groups = set()

        for app, model in get_accessible_models_for_user(user):
            if app.name.startswith("django."):
                continue
            nodes.add(SchemaNode.from_model(model))
            groups.add(SchemaGroup.from_model(model))

            # Proxy models
            if model._meta.proxy:
                edges.add(SchemaEdge.proxy(model, model._meta.proxy_for_model))
                continue

            # Subclassing
            for base in filter(cls._is_model_subclass, model.__mro__):
                nodes.add(SchemaNode.from_model(base))
                groups.add(SchemaGroup.from_model(base))
                for parent in filter(cls._is_model_subclass, base.__bases__):
                    edges.add(SchemaEdge.subclass(base, parent))

            # Relationships
            for field in model._meta.get_fields():
                edge = SchemaEdge.from_field(model, field)
                if edge is None:
                    continue
                edges.add(edge)
        # Remove edges with invalid nodes, can be f.e. references to Django Models we usually dont draw
        node_ids = {node.id for node in nodes}
        valid_edges = {
            edge
            for edge in edges
            if edge.source in node_ids and edge.target in node_ids
        }
        sorted_nodes = tuple(sorted(nodes))
        sorted_edges = tuple(sorted(valid_edges))
        sorted_groups = tuple(sorted(groups))
        return SchemaGraph(
            schema_hash=cls._build_schema_hash(
                sorted_nodes, sorted_edges, sorted_groups
            ),
            nodes=sorted_nodes,
            edges=sorted_edges,
            groups=sorted_groups,
        )

    @classmethod
    def get_all_apps(cls, user=None):
        """Get all apps that have at least one accessible model."""
        accessible_models = get_accessible_models_for_user(user)

        # Group by app
        apps_dict = {}
        for app, model in accessible_models:
            if app.label not in apps_dict:
                try:
                    apps_dict[app.label] = {
                        "name": app.name,
                        "label": app.label,
                        "verbose_name": app.verbose_name,
                        "models": [],
                    }
                except LookupError:
                    continue

            # Get the actual model
            try:
                apps_dict[app.label]["models"].append(
                    {
                        "name": model._meta.model_name,
                        "verbose_name": str(model._meta.verbose_name),
                        "count": model.objects.count(),
                    }
                )
            except LookupError:
                continue

        return list(apps_dict.values())

    @classmethod
    def get_all_models(
        cls, user=None, app_label=None, exclude_django=True
    ) -> list[ModelInfoShort]:
        """Get all models accessible to the current user from QLab registry."""
        result: list[ModelInfoShort] = []
        for app, model in get_accessible_models_for_user(user, app_label=app_label):
            if exclude_django and app.name.startswith("django."):
                continue
            if app_label and app.label != app_label:
                continue
            model_info = ModelInfoShort(
                app_label=model._meta.app_label,
                app_verbose_name=str(model._meta.app_config.verbose_name),
                model_name=model._meta.model_name or "UNKNOWN",
                verbose_name=str(model._meta.verbose_name),
                verbose_name_plural=str(model._meta.verbose_name_plural),
                abstract=model._meta.abstract,
                db_table=model._meta.db_table,
                managed=model._meta.managed,
            )
            result.append(model_info)
        return result

    @classmethod
    def get_model_by_name(cls, user, app_label, model_name) -> None | ModelInfo:
        """Get detailed information about a specific model if it is accessible."""
        if not is_model_accessible_for_user(user, app_label, model_name):
            return None

        try:
            model = apps.apps.get_model(app_label, model_name)
            return cls.get_model_info(model, user=user)
        except LookupError:
            return None

    @classmethod
    def get_model_by_id(cls, user, app_label, model_name):
        if not is_model_accessible_for_user(user, app_label, model_name):
            return None

        try:
            model = apps.apps.get_model(app_label, model_name)
            return cls._get_model_id(model)
        except LookupError:
            return None

    @classmethod
    def get_model_info(cls, model: type[models.Model], user=None) -> ModelInfo:
        """Get detailed information about a model, including fields and relations."""
        app_label = model._meta.app_label
        model_name = model._meta.model_name

        fields: list[FieldInfo] = []
        relations: list[RelationInfo] = []

        for field in model._meta.get_fields():
            # Process related fields (ForeignKey, ManyToManyField, etc.)
            if isinstance(field, (ForeignKey, OneToOneField)):
                # Check if related model is accessible
                related_app_label = field.related_model._meta.app_label
                related_model_name = field.related_model._meta.model_name

                if not is_model_accessible_for_user(
                    user, related_app_label, related_model_name
                ):
                    continue

                relation = RelationInfo(
                    name=field.name,
                    type=field.__class__.__name__,
                    related_model=f"{related_app_label}.{related_model_name}",
                    related_name=field.remote_field.name,
                    on_delete=field.remote_field.on_delete.__name__,
                    verbose_name=str(field.verbose_name),
                    help_text=str(field.help_text) if field.help_text else None,
                )
                relations.append(relation)
            elif isinstance(field, ManyToManyField):
                # Check if related model is accessible
                related_app_label = field.related_model._meta.app_label
                related_model_name = field.related_model._meta.model_name

                if not is_model_accessible_for_user(
                    user, related_app_label, related_model_name
                ):
                    continue
                relation = RelationInfo(
                    name=field.name,
                    type=field.__class__.__name__,
                    related_model=f"{related_app_label}.{related_model_name}",
                    related_name=field.remote_field.name,
                    verbose_name=str(field.verbose_name),
                    help_text=str(field.help_text) if field.help_text else None,
                )
                relations.append(relation)
            # Process reverse relations
            elif isinstance(field, (ManyToOneRel, ManyToManyRel, OneToOneRel)):
                # Check if related model is accessible
                related_app_label = field.related_model._meta.app_label
                related_model_name = field.related_model._meta.model_name

                if not is_model_accessible_for_user(
                    user, related_app_label, related_model_name or ""
                ):
                    continue
                relation = RelationInfo(
                    name=field.get_accessor_name() or field.name,
                    type=field.__class__.__name__,
                    related_model=f"{related_app_label}.{related_model_name}",
                    related_name=field.field.name,
                    verbose_name=str(field.related_model._meta.verbose_name),
                    help_text=None,
                    reverse=True,
                )
                relations.append(relation)
            # Process regular fields
            elif not field.is_relation:
                field_info = FieldInfo(
                    name=field.name,
                    type=field.__class__.__name__,
                    verbose_name=str(field.verbose_name)
                    if hasattr(field, "verbose_name")
                    else None,
                    help_text=str(field.help_text)
                    if hasattr(field, "help_text") and field.help_text
                    else None,
                    primary_key=field.primary_key
                    if hasattr(field, "primary_key")
                    else False,
                    null=field.null if hasattr(field, "null") else False,
                    blank=field.blank if hasattr(field, "blank") else False,
                    max_length=field.max_length
                    if hasattr(field, "max_length")
                    else None,
                    choices=[
                        {"value": choice[0], "display": str(choice[1])}
                        for choice in field.choices
                    ]
                    if hasattr(field, "choices") and field.choices
                    else None,
                )
                fields.append(field_info)

        methods: list[MethodInfo] = []
        return ModelInfo(
            app_label=app_label,
            app_verbose_name=str(model._meta.app_config.verbose_name),
            model_name=model_name or "UNKNOWN",
            verbose_name=str(model._meta.verbose_name),
            verbose_name_plural=str(model._meta.verbose_name_plural),
            fields=fields,
            relations=relations,
            methods=methods,
            abstract=model._meta.abstract,
            db_table=model._meta.db_table,
            managed=model._meta.managed,
        )

    @classmethod
    def get_model_graph(cls, user=None, app_label=None):
        """Generate a graph representation of accessible models and their relationships."""
        nodes = []
        edges = []
        node_ids = {}  # Keep track of node IDs

        models_info = cls.get_all_models(user=user, app_label=app_label)

        # First pass: create nodes
        for i, model_info in enumerate(models_info):
            model_id = f"{model_info['app_label']}.{model_info['model_name']}"
            node_ids[model_id] = i

            nodes.append(
                {
                    "id": i,
                    "label": model_info["verbose_name"],
                    "model": model_id,
                    "fields": [
                        f["name"]
                        for f in model_info["fields"]
                        if f.get("primary_key") is not True
                    ],
                }
            )

        # Second pass: create edges
        for model_info in models_info:
            source_id = node_ids[
                f"{model_info['app_label']}.{model_info['model_name']}"
            ]

            for relation in model_info["relations"]:
                target_model = relation["related_model"]
                if target_model in node_ids:
                    target_id = node_ids[target_model]

                    # Determine edge type and label
                    if relation["type"] == "ForeignKey":
                        edge_type = "fk"
                        label = f"{relation['name']} → {relation['related_name']}"
                    elif relation["type"] == "ManyToManyField":
                        edge_type = "m2m"
                        label = f"{relation['name']} ↔ {relation['related_name']}"
                    elif relation["type"] == "OneToOneField":
                        edge_type = "o2o"
                        label = f"{relation['name']} ⟷ {relation['related_name']}"
                    else:
                        edge_type = "rel"
                        label = relation["name"]

                    # Skip reverse relations to avoid duplicate edges
                    if relation.get("reverse"):
                        continue

                    edges.append(
                        {
                            "source": source_id,
                            "target": target_id,
                            "type": edge_type,
                            "label": label,
                            "id": f"e{source_id}-{target_id}-{relation['name']}",
                        }
                    )

        return {
            "nodes": nodes,
            "edges": edges,
        }

    @classmethod
    def _build_adjacency_list(
        cls, graph: "SchemaGraph"
    ) -> dict[str, list[tuple[str, SchemaEdge, bool]]]:
        """
        Builds an undirected adjacency list from the graph edges.
        Returns a dict: node_id -> list of (adjacent_node_id, edge_object, is_forward)
        """
        adj_list = {node.id: [] for node in graph.nodes}

        for edge in graph.edges:
            # Ensure nodes exist in our valid adjacency list
            if edge.source in adj_list and edge.target in adj_list:
                # Forward traversal
                adj_list[edge.source].append((edge.target, edge, True))
                # Reverse traversal
                if edge.reverse_name != "+":
                    adj_list[edge.target].append((edge.source, edge, False))

        return adj_list

    @classmethod
    def _bfs_shortest_path(
        cls,
        adj_list: dict[str, list[tuple[str, SchemaEdge, bool]]],
        start_id: str,
        end_id: str,
        excluded_ids: set[str] = None,
    ) -> list[PathStep] | None:
        """Finds the shortest path between two nodes using Breadth-First Search."""
        if start_id == end_id:
            return []

        queue = deque([(start_id, [])])
        excluded_ids = excluded_ids or set()
        visited = {start_id}

        while queue:
            current, path = queue.popleft()

            for neighbor, edge, is_forward in adj_list.get(current, []):
                if neighbor in excluded_ids:
                    continue

                if neighbor == end_id:
                    # We found the target, return the completed path
                    return path + [PathStep(current, neighbor, edge, is_forward)]

                if neighbor not in visited:
                    visited.add(neighbor)
                    new_path = path + [PathStep(current, neighbor, edge, is_forward)]
                    queue.append((neighbor, new_path))

        return None  # No path found

    @classmethod
    def _find_k_shortest_paths(
        cls,
        adj_list: dict[str, list[tuple[str, SchemaEdge, bool]]],
        start_id: str,
        end_id: str,
        k: int = 5,
        max_depth: int = 10,
        excluded_ids: set[str] = None,
    ) -> list[list[PathStep]]:
        """Finds up to k shortest paths between two nodes using BFS."""
        if start_id == end_id:
            return []

        excluded_ids = excluded_ids or set()
        paths = []
        # Queue: (current_id, path_steps, visited_set)
        queue = deque([(start_id, [], {start_id})])

        # Limit iterations to prevent hanging on dense graphs
        iterations = 0
        max_iterations = 10000  # Safety break

        while queue and len(paths) < k and iterations < max_iterations:
            iterations += 1
            current, steps, visited = queue.popleft()

            if current == end_id:
                paths.append(steps)
                continue

            # Depth limit
            if len(steps) >= max_depth:
                continue

            for neighbor, edge, is_forward in adj_list.get(current, []):
                if neighbor in excluded_ids:
                    continue

                if neighbor not in visited:
                    new_visited = visited | {neighbor}
                    new_steps = steps + [PathStep(current, neighbor, edge, is_forward)]
                    queue.append((neighbor, new_steps, new_visited))

        return paths

    @staticmethod
    def _get_path_model_ids(
        start_model_id: str,
        end_model_id: str,
        steps: list[PathStep],
    ) -> set[str]:
        model_ids = {start_model_id, end_model_id}
        for step in steps:
            model_ids.add(step.source_model_id)
            model_ids.add(step.target_model_id)
        return model_ids

    @classmethod
    def _rank_paths_by_preferences(
        cls,
        paths: list[list[PathStep]],
        start_model_id: str,
        end_model_id: str,
        preferred_models: list[str],
    ) -> list[list[PathStep]]:
        preferred_ids = set(preferred_models)

        def matched_preferred_ids(steps: list[PathStep]) -> set[str]:
            return preferred_ids & cls._get_path_model_ids(
                start_model_id,
                end_model_id,
                steps,
            )

        def intermediate_model_ids(steps: list[PathStep]) -> set[str]:
            return cls._get_path_model_ids(start_model_id, end_model_id, steps) - {
                start_model_id,
                end_model_id,
            }

        remaining_paths = sorted(
            paths,
            key=lambda steps: (-len(matched_preferred_ids(steps)), len(steps)),
        )
        ranked_paths: list[list[PathStep]] = []
        used_intermediate_ids: set[str] = set()

        while remaining_paths:
            if not ranked_paths:
                next_path = remaining_paths.pop(0)
            else:
                next_path = min(
                    remaining_paths,
                    key=lambda steps: (
                        -len(matched_preferred_ids(steps)),
                        len(intermediate_model_ids(steps) & used_intermediate_ids),
                        len(steps),
                    ),
                )
                remaining_paths.remove(next_path)

            ranked_paths.append(next_path)
            used_intermediate_ids.update(intermediate_model_ids(next_path))

        return ranked_paths

    @staticmethod
    def _serialize_path_steps(
        steps: list[PathStep],
    ) -> tuple[tuple[str, str, bool], ...]:
        return tuple(
            (step.source_model_id, step.target_model_id, step.is_forward)
            for step in steps
        )

    @classmethod
    def _deduplicate_paths(cls, paths: list[list[PathStep]]) -> list[list[PathStep]]:
        seen_signatures: set[tuple[tuple[str, str, bool], ...]] = set()
        unique_paths: list[list[PathStep]] = []

        for steps in paths:
            signature = cls._serialize_path_steps(steps)
            if signature in seen_signatures:
                continue
            seen_signatures.add(signature)
            unique_paths.append(steps)

        return unique_paths

    @classmethod
    def _combine_waypoint_segment_paths(
        cls,
        segment_paths: list[list[list[PathStep]]],
        start_model_id: str,
        max_depth: int,
        candidate_limit: int,
    ) -> list[list[PathStep]]:
        combined_paths: list[list[PathStep]] = []

        def visit(
            segment_index: int,
            accumulated_steps: list[PathStep],
            visited_model_ids: set[str],
        ) -> None:
            if len(combined_paths) >= candidate_limit:
                return

            if segment_index == len(segment_paths):
                combined_paths.append(accumulated_steps)
                return

            for segment in segment_paths[segment_index]:
                if len(accumulated_steps) + len(segment) > max_depth:
                    continue

                next_target_ids = [step.target_model_id for step in segment]
                if any(model_id in visited_model_ids for model_id in next_target_ids):
                    continue

                visit(
                    segment_index + 1,
                    accumulated_steps + segment,
                    visited_model_ids | set(next_target_ids),
                )

        visit(0, [], {start_model_id})
        return cls._deduplicate_paths(combined_paths)

    @classmethod
    def find_paths(
        cls,
        user,
        start_model_id: str,
        end_model_id: str,
        waypoints: list[str] = None,
        preferred_models: list[str] = None,
        excluded_models: list[str] = None,
        k: int = 5,
        max_depth: int = 10,
    ) -> list[SchemaPath]:
        """
        Finds paths from start_model_id to end_model_id.
        If waypoints are provided, returns a single path connecting them.
        Otherwise, returns a list of alternative paths, optionally ranked
        higher when they pass through preferred models.
        """
        graph = cls.get_schema(user=user)
        adj_list = cls._build_adjacency_list(graph)

        waypoints = waypoints or []
        preferred_models = preferred_models or []
        excluded_ids = set(excluded_models or [])

        # If waypoints are provided, every returned path must pass through them
        # in order. We still return alternatives instead of collapsing to a
        # single shortest segment chain.
        if waypoints:
            sequence = [start_model_id] + waypoints + [end_model_id]
            segment_limit = max(k, min(15, k * 3))
            candidate_limit = max(k, min(250, k * 25))
            segment_path_options: list[list[list[PathStep]]] = []

            for i in range(len(sequence) - 1):
                current_start = sequence[i]
                current_end = sequence[i + 1]

                if current_start not in adj_list or current_end not in adj_list:
                    return []

                segment_steps = cls._find_k_shortest_paths(
                    adj_list,
                    current_start,
                    current_end,
                    k=segment_limit,
                    max_depth=max_depth,
                    excluded_ids=excluded_ids,
                )

                if not segment_steps:
                    return []

                segment_path_options.append(segment_steps)

            combined_paths = cls._combine_waypoint_segment_paths(
                segment_path_options,
                start_model_id,
                max_depth=max_depth,
                candidate_limit=candidate_limit,
            )
            ranked_paths = cls._rank_paths_by_preferences(
                combined_paths,
                start_model_id,
                end_model_id,
                preferred_models,
            )[:k]

            return [
                SchemaPath(
                    start_model_id=start_model_id,
                    end_model_id=end_model_id,
                    steps=steps,
                    waypoints=waypoints,
                )
                for steps in ranked_paths
            ]

        # No waypoints: find multiple alternative paths
        if start_model_id not in adj_list or end_model_id not in adj_list:
            return []

        raw_paths_steps = cls._find_k_shortest_paths(
            adj_list,
            start_model_id,
            end_model_id,
            k=max(k, min(100, k * 5 if preferred_models else k)),
            max_depth=max_depth,
            excluded_ids=excluded_ids,
        )

        ranked_paths = cls._rank_paths_by_preferences(
            raw_paths_steps,
            start_model_id,
            end_model_id,
            preferred_models,
        )[:k]

        return [
            SchemaPath(
                start_model_id=start_model_id,
                end_model_id=end_model_id,
                steps=steps,
                waypoints=[],
            )
            for steps in ranked_paths
        ]

    @classmethod
    def format_path_for_frontend(cls, path: "SchemaPath") -> SchemaRoute:
        """Converts a raw SchemaPath into a clean sequence of field-based steps for the UI."""
        route_steps = []

        for step in path.steps:
            edge = step.edge

            # Figure out the exact field name based on traversal direction
            if step.is_forward:
                field_name = edge.source_field
                # Forward FKs and O2Os are single. Forward M2Ms are 'many'.
                is_many = edge.is_many_to_many
            else:
                # Reverse traversal
                if edge.reverse_name:
                    field_name = edge.reverse_name
                else:
                    # Django's default fallback for reverse relations if related_name is not set
                    model_name = edge.source.split(".")[-1].lower()
                    field_name = f"{model_name}_set"

                # Reverse FKs and M2Ms are 'many'. Reverse O2Os are single.
                is_many = not edge.is_one_to_one

            route_steps.append(
                RouteStep(
                    from_model=step.source_model_id,
                    to_model=step.target_model_id,
                    via_field=field_name,
                    is_forward=step.is_forward,
                    is_many=is_many,
                )
            )

        return SchemaRoute(
            start_model=path.start_model_id,
            end_model=path.end_model_id,
            route=route_steps,
            waypoints=path.waypoints,
        )
