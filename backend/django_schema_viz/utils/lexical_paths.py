"""
Lexical state inspection — collect ``data-reference`` paths from persisted
editor states (StyleTemplate.text_content / GroupTemplate.text_content).

The generation engine uses this to know, ahead of executing a recipe, which
relation paths need to be prefetched and resolved per model so that
``{{templates.name}}``-style chips render against live data.

Why backend-side: ``data-reference`` is our own Lexical node — its JSON shape
(``{type: 'data-reference', path: '...'}``) is stable and small. Walking it
in Python avoids storing a redundant ``referencedPaths`` field that could
drift from the canonical lexical state.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Iterator
from typing import Any


TEMPLATE_TEXT_PATTERN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def _coerce_root(editor_state: Any) -> dict | None:
    """Accept Lexical state as either a dict or a JSON string."""
    if isinstance(editor_state, str):
        try:
            editor_state = json.loads(editor_state)
        except (TypeError, ValueError):
            return None
    if not isinstance(editor_state, dict):
        return None
    # Some payloads pass the inner root directly; others wrap with {"root": {...}}.
    root = editor_state.get("root")
    if isinstance(root, dict):
        return root
    return editor_state


def _walk(node: Any) -> Iterator[str]:
    if not isinstance(node, dict):
        return
    if node.get("type") == "data-reference":
        # Accept the same field aliases the SVG/draw.io exporters recognise
        # (see export/_lexical_utils.py::extract_text_recursive).
        path = (
            node.get("path")
            or node.get("fieldName")
            or node.get("field_name")
            or node.get("text")
        )
        if isinstance(path, str):
            stripped = path.strip()
            if stripped:
                yield stripped
    elif node.get("type") == "text":
        text = node.get("text")
        if isinstance(text, str):
            for match in TEMPLATE_TEXT_PATTERN.finditer(text):
                path = match.group(1).strip()
                if path:
                    yield path
    children = node.get("children")
    if isinstance(children, list):
        for child in children:
            yield from _walk(child)


def collect_data_reference_paths(editor_state: Any) -> set[str]:
    """Return every ``data-reference`` path inside a single Lexical state."""
    root = _coerce_root(editor_state)
    if root is None:
        return set()
    return set(_walk(root))


def collect_paths_for_states(editor_states: Iterable[Any]) -> set[str]:
    """Union of paths across multiple Lexical states (e.g. style + group)."""
    result: set[str] = set()
    for state in editor_states:
        result.update(collect_data_reference_paths(state))
    return result


def has_relation_segment(path: str) -> bool:
    """Cheap check — ``True`` when a collected path contains a dotted segment."""
    return "." in path
