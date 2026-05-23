"""
Dataclasses and serializers for generation engine output.

Separated from generation_engine.py so serializers.py can reference
GenerationResultSerializer without a circular import.
"""

from dataclasses import dataclass, field
from typing import Any

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
class GenerationFilterImpact:
    """A filtered traversal branch that had related records before filtering."""

    step_id: str
    parent_step_id: str | None
    relationship: str
    parent_model: str
    parent_record_pk: str
    parent_display_name: str
    target_model: str
    target_label: str | None
    message: str


@dataclass
class GenerationResult:
    """Complete output of a template execution."""

    nodes: list[GeneratedNode] = field(default_factory=list)
    edges: list[GeneratedEdge] = field(default_factory=list)
    filter_impact: list[GenerationFilterImpact] = field(default_factory=list)


class GenerationResultSerializer(DataclassSerializer):
    """Complete output of a template execution."""

    class Meta:
        dataclass = GenerationResult
        fields = ("nodes", "edges")


class GenerationFilterImpactSerializer(DataclassSerializer):
    """Filter diagnostics for a generation run."""

    class Meta:
        dataclass = GenerationFilterImpact
