"""
Shared Lexical parsing utilities used by both SVG and draw.io exporters.
"""

from __future__ import annotations

from typing import Any
from datetime import date, datetime
import json
import re
from django.utils import timezone
from django.utils.formats import date_format
from django.utils.dateparse import parse_date, parse_datetime

TEXT_FORMAT_BOLD = 1
TEXT_FORMAT_ITALIC = 2
TEXT_FORMAT_UNDERLINE = 8

ALLOWED_INLINE_LABEL_STYLE_KEYS = {
    "color",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "text-decoration",
}
INLINE_LABEL_STYLE_ORDER = (
    "color",
    "font-size",
    "font-family",
    "font-weight",
    "font-style",
    "text-decoration",
)


def has_text_format(value: Any, flag: int) -> bool:
    if isinstance(value, int):
        return bool(value & flag)
    if isinstance(value, str):
        parts = {part.strip().lower() for part in re.split(r"[\s,]+", value) if part.strip()}
        lookup = {
            TEXT_FORMAT_BOLD: "bold",
            TEXT_FORMAT_ITALIC: "italic",
            TEXT_FORMAT_UNDERLINE: "underline",
        }
        expected = lookup.get(flag)
        return expected in parts if expected else False
    return False


def parse_inline_style_string(value: Any) -> dict[str, str]:
    if not isinstance(value, str):
        return {}

    styles: dict[str, str] = {}
    for entry in value.split(";"):
        entry = entry.strip()
        if not entry or ":" not in entry:
            continue
        raw_key, raw_value = entry.split(":", 1)
        key = normalize_style_key_to_css(raw_key.strip())
        style_value = raw_value.strip()
        if key and style_value:
            styles[key] = style_value
    return styles


def normalize_label_styles(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}

    normalized: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        key = normalize_style_key_to_css(str(raw_key))
        if key not in ALLOWED_INLINE_LABEL_STYLE_KEYS:
            continue
        style_value = str(raw_value).strip()
        if style_value:
            normalized[key] = style_value
    return normalized


def normalize_style_key_to_css(key: str) -> str:
    if key.startswith("--"):
        return key
    return re.sub(r"([A-Z])", lambda match: f"-{match.group(1).lower()}", key)


def serialize_inline_label_styles(styles: dict[str, str]) -> str:
    ordered_keys = [key for key in INLINE_LABEL_STYLE_ORDER if key in styles]
    ordered_keys.extend(sorted(key for key in styles if key not in ordered_keys))
    return ";".join(f"{key}:{styles[key]}" for key in ordered_keys)


def format_placeholder_display_value(value: Any) -> str:
    if isinstance(value, datetime):
        resolved_datetime = timezone.localtime(value) if timezone.is_aware(value) else value
        return date_format(resolved_datetime, "DATETIME_FORMAT")

    if isinstance(value, date):
        return date_format(value, "DATE_FORMAT")

    if isinstance(value, str):
        parsed_datetime = parse_datetime(value)
        if parsed_datetime is not None:
            return format_placeholder_display_value(parsed_datetime)

        parsed_date = parse_date(value)
        if parsed_date is not None:
            return format_placeholder_display_value(parsed_date)

    return str(value)


def resolve_known_placeholders(text: str, data: dict[str, Any]) -> str:
    """Resolve ``{{field}}`` placeholders using node data and record fields.

    Resolution priority:
    1. ``{{id}}`` / ``{{pk}}`` → ``modelId``
    2. Any other key → looked up in ``data["_record_fields"]``
    3. Unresolved placeholders are left as-is.
    """
    model_id = data.get("modelId") or data.get("model_id")
    record_fields: dict[str, Any] = (
        data.get("_record_fields")
        or data.get("_recordFields")
        or data.get("record_fields")
        or data.get("recordFields")
        or {}
    )

    if model_id in (None, "") and not record_fields:
        return text

    model_id_str = str(model_id) if model_id not in (None, "") else ""

    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        key_lower = key.lower()
        if key_lower in {"id", "pk"} and model_id_str:
            return model_id_str
        # Look up the field in the fetched record data.
        value = record_fields.get(key)
        if value is None:
            # Try case-insensitive fallback.
            for rk, rv in record_fields.items():
                if rk.lower() == key_lower:
                    value = rv
                    break
        if value is not None:
            return format_placeholder_display_value(value)
        return match.group(0)

    return re.sub(r"\{\{\s*([^{}]+)\s*\}\}", replace, text)


def resolve_placeholder_value(field: str, data: dict[str, Any]) -> str:
    """Resolve a single ``data-reference`` field to its display value.

    Resolution priority mirrors ``resolve_known_placeholders``:
    1. ``id`` / ``pk`` → ``modelId``
    2. Any other key → ``data["_record_fields"]``
    3. Falls back to ``{{field}}`` literal when unresolved.
    """
    stripped_field = field.strip()
    if not stripped_field:
        return ""

    model_id = data.get("modelId") or data.get("model_id")
    if stripped_field.lower() in {"id", "pk"} and model_id not in (None, ""):
        return str(model_id)

    # Look up in fetched record fields.
    record_fields: dict[str, Any] = (
        data.get("_record_fields")
        or data.get("_recordFields")
        or data.get("record_fields")
        or data.get("recordFields")
        or {}
    )
    value = record_fields.get(stripped_field)
    if value is None:
        key_lower = stripped_field.lower()
        for rk, rv in record_fields.items():
            if rk.lower() == key_lower:
                value = rv
                break
    if value is not None:
        return format_placeholder_display_value(value)

    return f"{{{{{stripped_field}}}}}"


def normalize_text_alignment(value: Any) -> str | None:
    """Parse Lexical paragraph format into alignment string.

    Handles both string values ("center") and integer format codes
    (1=left, 2=center, 3=right, 4=justify) used by Lexical.
    """
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"left", "right", "center", "justify", "start", "end"}:
            return normalized
        return None
    if isinstance(value, int):
        return {1: "left", 2: "center", 3: "right", 4: "justify"}.get(value)
    return None


def parse_lexical_json(editor_state: Any) -> dict | None:
    """Parse editor_state to dict, handling both string and dict inputs."""
    if isinstance(editor_state, str):
        try:
            editor_state = json.loads(editor_state)
        except (TypeError, ValueError):
            return None
    if not isinstance(editor_state, dict):
        return None
    return editor_state


def extract_text_recursive(node: Any) -> str:
    """Recursively extract plain text from Lexical AST nodes."""
    if not isinstance(node, dict):
        return ""

    node_type = node.get("type")

    if node_type == "text":
        return str(node.get("text", ""))

    if node_type == "linebreak":
        return "\n"

    if node_type == "data-reference":
        field = (
            node.get("fieldName")
            or node.get("field_name")
            or node.get("path")
            or node.get("text")
            or ""
        )
        return f"{{{{{field}}}}}" if field else ""

    child_text = "".join(extract_text_recursive(child) for child in node.get("children", []))
    if node_type in {"paragraph", "heading"} and child_text:
        return f"{child_text}\n"
    return child_text
