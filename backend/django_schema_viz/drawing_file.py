import json
from collections.abc import Mapping

from rest_framework import serializers

from .drawing_validation import (
    validate_drawing_document,
    validate_lexical_state,
    validate_react_flow_state,
)

SCHEMEVIZ_DRAWING_FILE_FORMAT = "schemeviz/drawing"
SCHEMEVIZ_DRAWING_FILE_VERSION = 1


def _ensure_mapping(value, error_message: str):
    if not isinstance(value, Mapping):
        raise serializers.ValidationError(error_message)
    return value


def parse_drawing_file_json(serialized: str):
    try:
        payload = json.loads(serialized)
    except json.JSONDecodeError as exc:
        raise serializers.ValidationError(
            "Uploaded SchemeViz file is not valid JSON."
        ) from exc

    envelope = _ensure_mapping(payload, "SchemeViz file must be a JSON object.")

    file_format = envelope.get("format")
    if file_format != SCHEMEVIZ_DRAWING_FILE_FORMAT:
        raise serializers.ValidationError(
            f'Unsupported SchemeViz file format "{file_format}".'
        )

    version = envelope.get("version")
    if version != SCHEMEVIZ_DRAWING_FILE_VERSION:
        raise serializers.ValidationError(
            f"Unsupported SchemeViz file version {version}."
        )

    content = _ensure_mapping(
        envelope.get("content"),
        "SchemeViz file content must be an object.",
    )

    title = content.get("title")
    if not isinstance(title, str) or not title.strip():
        raise serializers.ValidationError(
            "SchemeViz file content.title must be a non-empty string."
        )

    description = content.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str):
        raise serializers.ValidationError(
            "SchemeViz file content.description must be a string."
        )

    react_flow_state = content.get("reactFlowState")
    lexical_state = content.get("lexicalState", {})
    validate_react_flow_state(react_flow_state)
    validate_lexical_state(lexical_state)
    validate_drawing_document(react_flow_state, lexical_state)

    return {
        "title": title,
        "description": description,
        "react_flow_state": react_flow_state,
        "lexical_state": lexical_state,
    }
