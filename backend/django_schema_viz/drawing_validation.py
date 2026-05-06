from collections.abc import Mapping, Sequence
from math import isfinite

from rest_framework import serializers


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_react_flow_state(value):
    if not isinstance(value, Mapping):
        raise serializers.ValidationError(
            "react_flow_state must be an object with nodes, edges, and viewport."
        )

    nodes = value.get("nodes")
    edges = value.get("edges")
    viewport = value.get("viewport")

    if not isinstance(nodes, Sequence) or isinstance(nodes, (str, bytes, bytearray)):
        raise serializers.ValidationError("react_flow_state.nodes must be an array.")

    if not isinstance(edges, Sequence) or isinstance(edges, (str, bytes, bytearray)):
        raise serializers.ValidationError("react_flow_state.edges must be an array.")

    if not isinstance(viewport, Mapping):
        raise serializers.ValidationError("react_flow_state.viewport must be an object.")

    for axis in ("x", "y", "zoom"):
        coordinate = viewport.get(axis)
        if not _is_number(coordinate) or not isfinite(coordinate):
            raise serializers.ValidationError(
                f"react_flow_state.viewport.{axis} must be a finite number."
            )

    node_ids = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, Mapping):
            raise serializers.ValidationError(
                f"react_flow_state.nodes[{index}] must be an object."
            )

        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            raise serializers.ValidationError(
                f"react_flow_state.nodes[{index}].id must be a non-empty string."
            )

        if node_id in node_ids:
            raise serializers.ValidationError(
                f'react_flow_state.nodes[{index}].id "{node_id}" is duplicated.'
            )

        node_ids.add(node_id)

    for index, edge in enumerate(edges):
        if not isinstance(edge, Mapping):
            raise serializers.ValidationError(
                f"react_flow_state.edges[{index}] must be an object."
            )

        edge_id = edge.get("id")
        if not isinstance(edge_id, str) or not edge_id.strip():
            raise serializers.ValidationError(
                f"react_flow_state.edges[{index}].id must be a non-empty string."
            )

        source = edge.get("source")
        target = edge.get("target")
        if not isinstance(source, str) or not source.strip():
            raise serializers.ValidationError(
                f"react_flow_state.edges[{index}].source must be a non-empty string."
            )
        if not isinstance(target, str) or not target.strip():
            raise serializers.ValidationError(
                f"react_flow_state.edges[{index}].target must be a non-empty string."
            )

    return value


def validate_lexical_state(value):
    if not isinstance(value, Mapping):
        raise serializers.ValidationError(
            "lexical_state must be an object keyed by node id."
        )

    for key, editor_state in value.items():
        if not isinstance(key, str) or not key.strip():
            raise serializers.ValidationError(
                "lexical_state keys must be non-empty strings."
            )
        if not isinstance(editor_state, Mapping):
            raise serializers.ValidationError(
                f'lexical_state["{key}"] must be an object.'
            )

    return value


def validate_drawing_document(react_flow_state, lexical_state):
    nodes = react_flow_state.get("nodes", [])
    node_ids = {
        node["id"]
        for node in nodes
        if isinstance(node, Mapping) and isinstance(node.get("id"), str)
    }

    for index, edge in enumerate(react_flow_state.get("edges", [])):
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_ids or target not in node_ids:
            raise serializers.ValidationError(
                {
                    "react_flow_state": (
                        f"react_flow_state.edges[{index}] must reference existing node ids."
                    )
                }
            )

    for key in lexical_state.keys():
        if key not in node_ids:
            raise serializers.ValidationError(
                {
                    "lexical_state": (
                        f'lexical_state key "{key}" must match an existing node id.'
                    )
                }
            )
