from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import json
import math
import re
from xml.etree.ElementTree import Element, SubElement, tostring

from .shape_registry import get_shape
from ._lexical_utils import (
    TEXT_FORMAT_BOLD,
    TEXT_FORMAT_ITALIC,
    TEXT_FORMAT_UNDERLINE,
    has_text_format,
    parse_inline_style_string,
    normalize_label_styles,
    resolve_known_placeholders,
    resolve_placeholder_value,
    normalize_text_alignment,
    parse_lexical_json,
    extract_text_recursive,
)

SVG_NS = "http://www.w3.org/2000/svg"

DEFAULT_NODE_WIDTH = 240.0
DEFAULT_NODE_HEIGHT = 120.0
DEFAULT_EXPORT_WIDTH = 1920.0
DEFAULT_EXPORT_HEIGHT = 1080.0
DEFAULT_PADDING = 64.0

_DEFAULT_RECT_RADIUS_BY_SHAPE = {
    "box": 8.0,
    "group": 10.0,
}


# ---------------------------------------------------------------------------
# Color palettes for light / dark backgrounds
# ---------------------------------------------------------------------------

_LIGHT_PALETTE = {
    "node_fill": "#f4f4f5",
    "node_stroke": "#d4d4d8",
    "node_text": "#1f2937",
    "edge_stroke": "#9ca3af",
    "label_bg": "#ffffff",
    "label_text": "#6b7280",
    "label_border": "#d4d4d8",
}

_DARK_PALETTE = {
    "node_fill": "#1c171b",
    "node_stroke": "#352d33",
    "node_text": "#f5eff3",
    "edge_stroke": "#6b7280",
    "label_bg": "#1c171b",
    "label_text": "#d1d5db",
    "label_border": "#352d33",
}


def _is_dark_background(bg: str) -> bool:
    """Return True if *bg* is a dark hex color (perceived luminance < 128)."""
    if not bg.startswith("#") or len(bg) != 7:
        return False
    try:
        r = int(bg[1:3], 16)
        g = int(bg[3:5], 16)
        b = int(bg[5:7], 16)
        return (0.299 * r + 0.587 * g + 0.114 * b) < 128
    except ValueError:
        return False


def _get_palette(background: str) -> dict[str, str]:
    """Select a fallback color palette based on background brightness."""
    return _DARK_PALETTE if _is_dark_background(background) else _LIGHT_PALETTE


def _get_default_rect_radius(shape_key: str) -> float:
    return _DEFAULT_RECT_RADIUS_BY_SHAPE.get(shape_key, 10.0)


# ---------------------------------------------------------------------------
# Rich text data structures
# ---------------------------------------------------------------------------


@dataclass
class RichTextSpan:
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    color: str | None = None
    font_size: str | None = None


@dataclass
class RichTextLine:
    spans: list[RichTextSpan] = field(default_factory=list)
    alignment: str = "center"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def export_drawing_to_svg(
    react_flow_state: dict[str, Any],
    lexical_state: dict[str, Any] | None = None,
    *,
    width: int | None = None,
    height: int | None = None,
    mode: str = "current",
    padding: int = int(DEFAULT_PADDING),
    background: str = "#ffffff",
    scale_factor: float = 1.0,
) -> str:
    lexical_state = lexical_state or {}
    palette = _get_palette(background)

    raw_nodes: list[dict[str, Any]] = react_flow_state.get("nodes", []) or []
    raw_edges: list[dict[str, Any]] = react_flow_state.get("edges", []) or []
    viewport = react_flow_state.get("viewport", {}) or {}

    # Pre-fetch record fields so {{field}} templates resolve to real values.
    record_cache = _build_record_cache(raw_nodes)

    nodes = [
        _normalize_node(node, lexical_state, record_cache, palette)
        for node in raw_nodes
    ]
    nodes_by_id = {node["id"]: node for node in nodes}
    edges = [
        _normalize_edge(edge, nodes_by_id, palette)
        for edge in raw_edges
        if edge.get("source") in nodes_by_id and edge.get("target") in nodes_by_id
    ]

    canvas_width = float(width) if width else DEFAULT_EXPORT_WIDTH
    canvas_height = float(height) if height else DEFAULT_EXPORT_HEIGHT

    if mode == "fit":
        world_to_screen = _fit_transform(
            nodes,
            width=canvas_width,
            height=canvas_height,
            padding=float(padding),
            scale_factor=float(scale_factor),
        )
    else:
        world_to_screen = _current_view_transform(
            viewport,
            width=canvas_width,
            height=canvas_height,
        )

    svg = Element(
        "svg",
        {
            "xmlns": SVG_NS,
            "width": str(int(round(canvas_width))),
            "height": str(int(round(canvas_height))),
            "viewBox": f"0 0 {int(round(canvas_width))} {int(round(canvas_height))}",
        },
    )
    if background != "transparent":
        SubElement(
            svg,
            "rect",
            {
                "x": "0",
                "y": "0",
                "width": str(int(round(canvas_width))),
                "height": str(int(round(canvas_height))),
                "fill": background,
            },
        )

    # Derive the uniform scale so stroke widths, font sizes, and radii
    # stay proportional to node dimensions at any export resolution.
    scale = _extract_scale(world_to_screen)

    # Render layers in correct z-order: edge paths → nodes → edge labels.
    # Edge labels must sit above both edge paths AND nodes so they are
    # never obscured, matching the frontend's EdgeLabelRenderer overlay.
    edges_group = SubElement(svg, "g", {"id": "edges"})
    pending_labels: list[tuple[str, float, float]] = []
    for edge in edges:
        _render_edge_path(edges_group, edge, world_to_screen, scale, pending_labels)

    nodes_group = SubElement(svg, "g", {"id": "nodes"})
    for node in nodes:
        _render_node(nodes_group, node, world_to_screen, scale)

    if pending_labels:
        labels_group = SubElement(svg, "g", {"id": "edge-labels"})
        for label_text, lx, ly in pending_labels:
            _render_edge_label(labels_group, label_text, lx, ly, scale, palette)

    return tostring(svg, encoding="unicode")


# ---------------------------------------------------------------------------
# Viewport transforms
# ---------------------------------------------------------------------------


def _current_view_transform(
    viewport: dict[str, Any],
    *,
    width: float,
    height: float,
):
    zoom = _to_float(viewport.get("zoom"), 1.0)
    tx = _to_float(viewport.get("x"), 0.0)
    ty = _to_float(viewport.get("y"), 0.0)

    def transform(x: float, y: float) -> tuple[float, float]:
        return x * zoom + tx, y * zoom + ty

    return transform


def _fit_transform(
    nodes: list[dict[str, Any]],
    *,
    width: float,
    height: float,
    padding: float,
    scale_factor: float = 1.0,
):
    if not nodes:
        return lambda x, y: (x, y)

    min_x = min(node["x"] for node in nodes)
    min_y = min(node["y"] for node in nodes)
    max_x = max(node["x"] + node["width"] for node in nodes)
    max_y = max(node["y"] + node["height"] for node in nodes)

    bounds_w = max(max_x - min_x, 1.0)
    bounds_h = max(max_y - min_y, 1.0)

    inner_w = max(width - 2 * padding, 1.0)
    inner_h = max(height - 2 * padding, 1.0)
    scale = min(inner_w / bounds_w, inner_h / bounds_h)

    # Apply user-requested scale factor.
    # >1 zooms in (content larger, may overflow canvas edges).
    # <1 zooms out (more whitespace around content).
    scale *= scale_factor

    # Center fitted content.
    offset_x = (width - bounds_w * scale) / 2 - min_x * scale
    offset_y = (height - bounds_h * scale) / 2 - min_y * scale

    def transform(x: float, y: float) -> tuple[float, float]:
        return x * scale + offset_x, y * scale + offset_y

    return transform


def _extract_scale(transform) -> float:
    """Derive the uniform scale factor from a coordinate transform.

    This lets stroke widths, font sizes, and border radii grow
    proportionally with the export resolution so edges don't look
    paper-thin at high-res.
    """
    x0, y0 = transform(0, 0)
    x1, _y1 = transform(1, 0)
    return max(abs(x1 - x0), 0.01)


# ---------------------------------------------------------------------------
# Record field resolution (for {{field}} template placeholders)
# ---------------------------------------------------------------------------


def _build_record_cache(
    raw_nodes: list[dict[str, Any]],
) -> dict[tuple[str, str, str], dict[str, Any]]:
    """Pre-fetch record field data for all nodes that reference a DB record.

    Returns a cache keyed by ``(app_label, model_name, model_id)`` so that
    duplicate references don't trigger repeated queries.
    """
    try:
        from django.apps import apps  # noqa: delayed import
    except Exception:
        return {}

    seen: dict[tuple[str, str, str], dict[str, Any]] = {}
    for node in raw_nodes:
        data = node.get("data") or {}
        app_label = data.get("appLabel") or data.get("app_label") or ""
        model_name = data.get("modelName") or data.get("model_name") or ""
        model_id = data.get("modelId") or data.get("model_id") or ""
        if not (app_label and model_name and model_id):
            continue
        cache_key = (str(app_label), str(model_name), str(model_id))
        if cache_key in seen:
            continue
        try:
            model = apps.get_model(cache_key[0], cache_key[1])
            instance = model._default_manager.using("default").get(pk=cache_key[2])
            fields: dict[str, Any] = {}
            for f in model._meta.get_fields():
                if not hasattr(f, "attname"):
                    continue  # skip relations
                try:
                    val = getattr(instance, f.attname, None)
                    if val is not None:
                        fields[f.name] = val
                except Exception:
                    pass
            seen[cache_key] = fields
        except Exception:
            seen[cache_key] = {}
    return seen


def _record_fields_for_node(
    data: dict[str, Any],
    cache: dict[tuple[str, str, str], dict[str, Any]],
) -> dict[str, Any]:
    """Return the cached record fields for a single node's data dict."""
    app_label = str(data.get("appLabel") or data.get("app_label") or "")
    model_name = str(data.get("modelName") or data.get("model_name") or "")
    model_id = str(data.get("modelId") or data.get("model_id") or "")
    if not (app_label and model_name and model_id):
        return {}
    return cache.get((app_label, model_name, model_id), {})


# ---------------------------------------------------------------------------
# Node normalization
# ---------------------------------------------------------------------------


def _normalize_node(
    node: dict[str, Any],
    lexical_state: dict[str, Any],
    record_cache: dict[tuple[str, str, str], dict[str, Any]] | None = None,
    palette: dict[str, str] | None = None,
) -> dict[str, Any]:
    node_id = str(node.get("id", ""))
    node_type = str(node.get("type", "") or "")
    data = node.get("data", {}) or {}
    style = node.get("style", {}) or {}

    # Augment data with fetched record fields so that template
    # placeholders like {{name}} resolve to real values.
    if record_cache:
        record_fields = _record_fields_for_node(data, record_cache)
        if record_fields:
            data = {**data, "_record_fields": record_fields}

    position = node.get("positionAbsolute") or node.get("position") or {}
    x = _to_float(position.get("x"), 0.0)
    y = _to_float(position.get("y"), 0.0)

    width = (
        _to_float(node.get("width"))
        or _to_float((node.get("measured") or {}).get("width"))
        or _to_float(style.get("width"))
        or DEFAULT_NODE_WIDTH
    )
    height = (
        _to_float(node.get("height"))
        or _to_float((node.get("measured") or {}).get("height"))
        or _to_float(style.get("height"))
        or DEFAULT_NODE_HEIGHT
    )

    # Shape key from data (cloud, cylinder, default)
    shape_key = str(data.get("shape", "") or "default")

    # Rich text lines (with formatting) from Lexical state
    rich_lines = _extract_rich_lines(node_id, data, lexical_state)

    # Plain text fallback
    if rich_lines:
        label = "\n".join(
            "".join(span.text for span in line.spans) for line in rich_lines
        ).strip()
    else:
        label = _extract_label(node_id, data, lexical_state)
        label = _strip_html_breaks(label)

    return {
        "id": node_id,
        "type": node_type,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "label": label,
        "rich_lines": rich_lines,
        "shape": shape_key,
        "fill": _to_color(
            style.get("backgroundColor"), (palette or _LIGHT_PALETTE)["node_fill"]
        ),
        "stroke": _to_color(
            style.get("borderColor"), (palette or _LIGHT_PALETTE)["node_stroke"]
        ),
        "text": _to_color(style.get("color"), (palette or _LIGHT_PALETTE)["node_text"]),
        "stroke_width": _to_float(style.get("borderWidth"), 1.0),
        "radius": _to_float(
            style.get("borderRadius"),
            _get_default_rect_radius(shape_key),
        ),
    }


# ---------------------------------------------------------------------------
# Edge normalization
# ---------------------------------------------------------------------------


def _normalize_edge(
    edge: dict[str, Any],
    nodes_by_id: dict[str, dict[str, Any]],
    palette: dict[str, str] | None = None,
) -> dict[str, Any]:
    source = nodes_by_id[str(edge.get("source"))]
    target = nodes_by_id[str(edge.get("target"))]

    source_anchor, source_side = _resolve_anchor(
        source,
        is_source=True,
        other=target,
        handle_id=edge.get("sourceHandle"),
    )
    target_anchor, target_side = _resolve_anchor(
        target,
        is_source=False,
        other=source,
        handle_id=edge.get("targetHandle"),
    )

    data = edge.get("data", {}) or {}
    elk_sections = data.get("elkSections") or None

    # Match the frontend's label priority:
    #   typeof label === 'string' ? label : edgeData?.relationName
    raw_label = edge.get("label")
    if isinstance(raw_label, str) and raw_label.strip():
        label = raw_label.strip()
    else:
        label = str(data.get("relationName") or "").strip()

    style = edge.get("style", {}) or {}
    return {
        "source": source_anchor,
        "target": target_anchor,
        "source_side": source_side,
        "target_side": target_side,
        "label": label,
        "stroke": _to_color(
            style.get("stroke"), (palette or _LIGHT_PALETTE)["edge_stroke"]
        ),
        "stroke_width": _to_float(style.get("strokeWidth"), 1.5),
        "elk_sections": elk_sections,
    }


# ---------------------------------------------------------------------------
# Anchor resolution
# ---------------------------------------------------------------------------


def _resolve_anchor(
    node: dict[str, Any],
    *,
    is_source: bool,
    other: dict[str, Any],
    handle_id: Any = None,
) -> tuple[tuple[float, float], str]:
    explicit = _parse_handle_position(handle_id)
    if explicit:
        return _anchor_by_side(node, explicit), explicit

    node_type = node.get("type")
    # Match the frontend's default handle wiring:
    # discover -> target top, source bottom
    # databaseSchema -> target left, source right
    if node_type == "discover":
        side = "bottom" if is_source else "top"
        return _anchor_by_side(node, side), side
    if node_type == "databaseSchema":
        side = "right" if is_source else "left"
        return _anchor_by_side(node, side), side

    # Fallback for flexible nodes (e.g. group): infer by relative placement.
    inferred_side = _infer_side(node, other)
    return _anchor_by_side(node, inferred_side), inferred_side


def _infer_side(node: dict[str, Any], other: dict[str, Any]) -> str:
    cx = node["x"] + node["width"] / 2
    cy = node["y"] + node["height"] / 2
    ox = other["x"] + other["width"] / 2
    oy = other["y"] + other["height"] / 2
    dx = ox - cx
    dy = oy - cy
    if abs(dy) >= abs(dx):
        return "bottom" if dy >= 0 else "top"
    return "right" if dx >= 0 else "left"


def _anchor_by_side(node: dict[str, Any], side: str) -> tuple[float, float]:
    x = node["x"]
    y = node["y"]
    w = node["width"]
    h = node["height"]
    if side == "top":
        return (x + w / 2, y)
    if side == "bottom":
        return (x + w / 2, y + h)
    if side == "left":
        return (x, y + h / 2)
    # right fallback
    return (x + w, y + h / 2)


def _parse_handle_position(handle_id: Any) -> str | None:
    if not isinstance(handle_id, str):
        return None
    lowered = handle_id.lower()
    for side in ("top", "bottom", "left", "right"):
        if side in lowered:
            return side
    return None


# ---------------------------------------------------------------------------
# Node rendering
# ---------------------------------------------------------------------------


def _render_node(parent: Element, node: dict[str, Any], transform, scale: float = 1.0):
    x1, y1 = transform(node["x"], node["y"])
    x2, y2 = transform(node["x"] + node["width"], node["y"] + node["height"])
    width = max(x2 - x1, 1.0)
    height = max(y2 - y1, 1.0)

    shape_def = get_shape(node.get("shape", "default"))

    if shape_def.svg_elements:
        _render_custom_shape(parent, node, shape_def, x1, y1, width, height, scale)
    else:
        _render_rect_shape(parent, node, x1, y1, width, height, scale)

    _render_node_label(parent, node, x1, y1, width, height, scale)


def _render_custom_shape(
    parent, node, shape_def, x, y, width, height, scale: float = 1.0
):
    """Render a shape using its SVG element definitions, stretched to fit.

    Custom shapes use a viewBox with ``preserveAspectRatio="none"`` so
    strokes in viewBox coordinates scale naturally with node dimensions.
    No additional *scale* multiplication is needed — the viewBox
    stretching already makes strokes proportional to the export
    resolution.
    """
    svg = SubElement(
        parent,
        "svg",
        {
            "x": f"{x:.2f}",
            "y": f"{y:.2f}",
            "width": f"{width:.2f}",
            "height": f"{height:.2f}",
            "viewBox": shape_def.svg_viewbox,
            "preserveAspectRatio": "none",
        },
    )

    fill_color = node["fill"]
    stroke_color = node["stroke"]
    stroke_width = shape_def.svg_stroke_width

    for elem in shape_def.svg_elements:
        attrs = dict(elem.attrs)

        if elem.fill_mode == "fill":
            attrs["fill"] = fill_color
        else:
            attrs["fill"] = "none"

        if elem.stroke_mode == "stroke":
            attrs["stroke"] = stroke_color
            attrs["stroke-width"] = f"{stroke_width}"
        else:
            attrs["stroke"] = "none"

        if elem.stroke_dasharray:
            attrs["stroke-dasharray"] = elem.stroke_dasharray

        SubElement(svg, elem.tag, attrs)


def _render_rect_shape(parent, node, x, y, width, height, scale: float = 1.0):
    """Render the default rectangle shape."""
    radius = max(min(node["radius"] * scale, width / 2, height / 2), 0.0)
    SubElement(
        parent,
        "rect",
        {
            "x": f"{x:.2f}",
            "y": f"{y:.2f}",
            "width": f"{width:.2f}",
            "height": f"{height:.2f}",
            "rx": f"{radius:.2f}",
            "ry": f"{radius:.2f}",
            "fill": node["fill"],
            "stroke": node["stroke"],
            "stroke-width": f"{node['stroke_width'] * scale:.2f}",
        },
    )


# ---------------------------------------------------------------------------
# Node label rendering (rich text)
# ---------------------------------------------------------------------------


def _render_node_label(parent, node, x, y, width, height, scale: float = 1.0):
    """Render node label as SVG text with rich formatting when available."""
    rich_lines: list[RichTextLine] = node.get("rich_lines", [])

    if not rich_lines:
        # Fall back to plain text
        plain = node.get("label", "")
        label_lines = [line for line in plain.split("\n") if line != ""]
        if not label_lines:
            return
        rich_lines = [
            RichTextLine(spans=[RichTextSpan(text=line)]) for line in label_lines
        ]

    # Font size is proportional to node dimensions.  The min/max clamps
    # must also scale so text stays visually consistent across export
    # resolutions.
    min_font = 14.0 * scale
    max_font = 42.0 * scale
    base_font_size = max(min_font, min(max_font, min(width / 12.0, height / 4.0)))
    line_height = base_font_size * 1.35
    total_text_height = line_height * len(rich_lines)
    start_y = y + height / 2 - total_text_height / 2 + base_font_size * 0.35

    text_pad = 12.0 * scale
    for line_idx, rich_line in enumerate(rich_lines):
        alignment = rich_line.alignment
        if alignment == "left":
            text_anchor = "start"
            text_x = x + text_pad
        elif alignment == "right":
            text_anchor = "end"
            text_x = x + width - text_pad
        else:
            text_anchor = "middle"
            text_x = x + width / 2

        line_y = start_y + line_idx * line_height

        text_el = SubElement(
            parent,
            "text",
            {
                "x": f"{text_x:.2f}",
                "y": f"{line_y:.2f}",
                "text-anchor": text_anchor,
                "font-family": "Arial, sans-serif",
                "font-size": f"{base_font_size:.2f}",
                "fill": node["text"],
            },
        )

        for span in rich_line.spans:
            tspan_attrs: dict[str, str] = {}
            if span.bold:
                tspan_attrs["font-weight"] = "bold"
            if span.italic:
                tspan_attrs["font-style"] = "italic"
            if span.underline:
                tspan_attrs["text-decoration"] = "underline"
            if span.color:
                tspan_attrs["fill"] = span.color
            if span.font_size:
                tspan_attrs["font-size"] = span.font_size

            tspan = SubElement(text_el, "tspan", tspan_attrs)
            tspan.text = span.text


# ---------------------------------------------------------------------------
# Edge rendering
# ---------------------------------------------------------------------------


def _render_edge_path(
    parent: Element,
    edge: dict[str, Any],
    transform,
    scale: float = 1.0,
    pending_labels: list[tuple[str, float, float]] | None = None,
):
    """Draw the edge path and collect its label for deferred rendering.

    Labels are NOT drawn here — they are appended to *pending_labels* so
    the caller can render them in a separate layer on top of all edges
    and nodes (matching the frontend's ``EdgeLabelRenderer`` overlay).
    """
    elk_sections = edge.get("elk_sections")
    if elk_sections:
        screen_points = _render_elk_edge_path(
            parent, edge, transform, elk_sections, scale
        )
    else:
        screen_points = _render_smooth_step_edge_path(parent, edge, transform, scale)

    label = edge.get("label", "").strip()
    if label and screen_points and pending_labels is not None:
        midpoint = _polyline_midpoint(screen_points)
        pending_labels.append((label, midpoint[0], midpoint[1]))


def _render_elk_edge_path(parent, edge, transform, elk_sections, scale: float = 1.0):
    """Render an ELK edge path and return screen-space points for label placement."""
    if not elk_sections:
        return []

    section = elk_sections[0]
    start = section.get("startPoint", {})
    end = section.get("endPoint", {})
    bends = section.get("bendPoints", []) or []

    # Build world-coord points list
    world_points = [(float(start.get("x", 0)), float(start.get("y", 0)))]
    for bp in bends:
        world_points.append((float(bp.get("x", 0)), float(bp.get("y", 0))))
    world_points.append((float(end.get("x", 0)), float(end.get("y", 0))))

    # Transform to screen coords
    screen_points = [transform(px, py) for px, py in world_points]

    # Build SVG path: M x y L x y L x y ...
    parts = [f"M {screen_points[0][0]:.2f} {screen_points[0][1]:.2f}"]
    for sx, sy in screen_points[1:]:
        parts.append(f"L {sx:.2f} {sy:.2f}")
    d = " ".join(parts)

    SubElement(
        parent,
        "path",
        {
            "d": d,
            "fill": "none",
            "stroke": edge["stroke"],
            "stroke-width": f"{edge['stroke_width'] * scale:.2f}",
        },
    )

    return screen_points


def _render_smooth_step_edge_path(parent, edge, transform, scale: float = 1.0):
    """Render a SmoothStep edge path and return screen-space points for label placement.

    Matches the frontend's ``getSmoothStepPath`` from React Flow so the
    exported SVG edges look identical to the on-canvas edges.
    """
    sx, sy = edge["source"]
    tx, ty = edge["target"]
    ssx, ssy = transform(sx, sy)
    stx, sty = transform(tx, ty)

    source_side = edge.get("source_side", "bottom")
    target_side = edge.get("target_side", "top")

    points = _smooth_step_points(ssx, ssy, source_side, stx, sty, target_side)
    d = _build_rounded_polyline(points, border_radius=5.0 * scale)

    SubElement(
        parent,
        "path",
        {
            "d": d,
            "fill": "none",
            "stroke": edge["stroke"],
            "stroke-width": f"{edge['stroke_width'] * scale:.2f}",
        },
    )

    return points


def _render_edge_label(
    parent, label, lx, ly, scale: float = 1.0, palette: dict[str, str] | None = None
):
    """Shared edge label rendering: background rect + centered text.

    All dimensions scale with the export resolution so the label stays
    proportional to nodes at any zoom / fit level.
    """
    pal = palette or _LIGHT_PALETTE
    font_size = 12.0 * scale
    text_width = max(28.0 * scale, len(label) * font_size * 0.6)
    text_height = font_size * 1.3
    pad_x = 7.0 * scale
    pad_y = 3.0 * scale
    corner_r = 6.0 * scale
    border_w = 1.0 * scale

    group = SubElement(parent, "g")
    SubElement(
        group,
        "rect",
        {
            "x": f"{(lx - text_width / 2 - pad_x):.2f}",
            "y": f"{(ly - text_height / 2 - pad_y):.2f}",
            "width": f"{(text_width + 2 * pad_x):.2f}",
            "height": f"{(text_height + 2 * pad_y):.2f}",
            "rx": f"{corner_r:.2f}",
            "ry": f"{corner_r:.2f}",
            "fill": pal["label_bg"],
            "fill-opacity": "0.92",
            "stroke": pal["label_border"],
            "stroke-opacity": "0.7",
            "stroke-width": f"{border_w:.2f}",
        },
    )
    text = SubElement(
        group,
        "text",
        {
            "x": f"{lx:.2f}",
            "y": f"{(ly + font_size * 0.35):.2f}",
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": f"{font_size:.2f}",
            "font-weight": "500",
            "fill": pal["label_text"],
        },
    )
    text.text = label


# ---------------------------------------------------------------------------
# Polyline midpoint (port of frontend getPathMidpoint)
# ---------------------------------------------------------------------------


def _polyline_midpoint(points: list[tuple[float, float]]) -> tuple[float, float]:
    """Walk segments and find the point at 50% of total path length."""
    if len(points) == 0:
        return (0.0, 0.0)
    if len(points) == 1:
        return points[0]

    total_length = 0.0
    for i in range(1, len(points)):
        dx = points[i][0] - points[i - 1][0]
        dy = points[i][1] - points[i - 1][1]
        total_length += math.hypot(dx, dy)

    if total_length == 0:
        return points[0]

    target = total_length / 2.0
    traversed = 0.0

    for i in range(1, len(points)):
        sx, sy = points[i - 1]
        ex, ey = points[i]
        seg_len = math.hypot(ex - sx, ey - sy)

        if traversed + seg_len >= target:
            ratio = (target - traversed) / seg_len
            return (sx + (ex - sx) * ratio, sy + (ey - sy) * ratio)

        traversed += seg_len

    return points[-1]


# ---------------------------------------------------------------------------
# SmoothStep path generation (mirrors React Flow's getSmoothStepPath)
# ---------------------------------------------------------------------------


def _smooth_step_points(
    sx: float,
    sy: float,
    source_side: str,
    tx: float,
    ty: float,
    target_side: str,
) -> list[tuple[float, float]]:
    """Compute the waypoints for a SmoothStep (orthogonal) edge.

    Returns the list of corner points forming the orthogonal polyline
    *before* corner-rounding.  The algorithm mirrors React Flow's
    ``getSmoothStepPath``:

    1. Determine the axis each handle exits on.
    2. Choose a centre line half-way between the two handles.
    3. Build an S-shape (or straight line) through that centre line
       using only horizontal and vertical segments.
    """

    _VERTICAL = {"top", "bottom"}
    _HORIZONTAL = {"left", "right"}

    # Both exits are vertical (bottom→top is the most common)
    if source_side in _VERTICAL and target_side in _VERTICAL:
        mid_y = (sy + ty) / 2.0
        if sx == tx:
            return [(sx, sy), (tx, ty)]
        return [(sx, sy), (sx, mid_y), (tx, mid_y), (tx, ty)]

    # Both exits are horizontal
    if source_side in _HORIZONTAL and target_side in _HORIZONTAL:
        mid_x = (sx + tx) / 2.0
        if sy == ty:
            return [(sx, sy), (tx, ty)]
        return [(sx, sy), (mid_x, sy), (mid_x, ty), (tx, ty)]

    # Mixed: one vertical exit, one horizontal exit → L-shape
    if source_side in _VERTICAL and target_side in _HORIZONTAL:
        # Source exits vertically → go to target's y, then horizontally
        return [(sx, sy), (sx, ty), (tx, ty)]

    # source_side horizontal, target_side vertical
    return [(sx, sy), (tx, sy), (tx, ty)]


def _build_rounded_polyline(
    points: list[tuple[float, float]],
    border_radius: float = 5.0,
) -> str:
    """Turn a polyline into an SVG path with rounded 90° corners.

    Each corner is replaced by a quadratic Bézier (``Q``) that
    smoothly connects the two adjacent segments — identical to
    React Flow's SmoothStep rendering.
    """
    if len(points) < 2:
        return ""
    if len(points) == 2:
        return (
            f"M {points[0][0]:.2f} {points[0][1]:.2f} "
            f"L {points[1][0]:.2f} {points[1][1]:.2f}"
        )

    d = f"M {points[0][0]:.2f} {points[0][1]:.2f}"

    for i in range(1, len(points) - 1):
        px, py = points[i - 1]
        cx, cy = points[i]  # corner vertex
        nx, ny = points[i + 1]

        # Incoming / outgoing segment lengths
        len_in = max(math.hypot(cx - px, cy - py), 1.0)
        len_out = max(math.hypot(nx - cx, ny - cy), 1.0)

        # Clamp radius to half the shorter segment
        r = min(border_radius, len_in / 2.0, len_out / 2.0)

        # Point just before the corner
        bx = cx - (cx - px) / len_in * r
        by = cy - (cy - py) / len_in * r
        # Point just after the corner
        ax = cx + (nx - cx) / len_out * r
        ay = cy + (ny - cy) / len_out * r

        d += f" L {bx:.2f} {by:.2f}"
        d += f" Q {cx:.2f} {cy:.2f} {ax:.2f} {ay:.2f}"

    # Final straight segment to the last point
    d += f" L {points[-1][0]:.2f} {points[-1][1]:.2f}"
    return d


# ---------------------------------------------------------------------------
# Lexical rich text extraction
# ---------------------------------------------------------------------------


def _extract_rich_lines(
    node_id: str,
    data: dict[str, Any],
    lexical_state: dict[str, Any],
) -> list[RichTextLine]:
    """Try to extract rich text lines from Lexical state."""
    for key in (f"{node_id}-main", node_id):
        editor_state = lexical_state.get(key)
        if editor_state:
            lines = _lexical_to_rich_lines(editor_state, data)
            if lines:
                return lines

    initial_text_content = data.get("initialTextContent") or data.get(
        "initial_text_content"
    )
    if initial_text_content:
        lines = _lexical_to_rich_lines(initial_text_content, data)
        if lines:
            return lines

    return []


def _lexical_to_rich_lines(
    editor_state: Any, data: dict[str, Any]
) -> list[RichTextLine]:
    """Parse Lexical editor state into structured rich text lines."""
    parsed = parse_lexical_json(editor_state)
    if parsed is None:
        return []

    root = parsed.get("root", parsed)
    children = root.get("children", [])

    lines: list[RichTextLine] = []
    for child in children:
        if not isinstance(child, dict):
            continue
        node_type = child.get("type")
        if node_type not in ("paragraph", "heading"):
            continue

        spans = _collect_spans(child, data)
        if not spans:
            continue

        alignment = normalize_text_alignment(child.get("format")) or "center"
        lines.append(RichTextLine(spans=spans, alignment=alignment))

    return lines


def _collect_spans(node: dict, data: dict[str, Any]) -> list[RichTextSpan]:
    """Collect RichTextSpan objects from a paragraph/heading node."""
    spans: list[RichTextSpan] = []
    for child in node.get("children", []):
        if not isinstance(child, dict):
            continue
        child_type = child.get("type")

        if child_type == "text":
            text = resolve_known_placeholders(str(child.get("text", "")), data)
            if not text:
                continue
            fmt = child.get("format", 0)
            style_str = child.get("style", "")
            inline_styles = parse_inline_style_string(style_str)

            spans.append(
                RichTextSpan(
                    text=text,
                    bold=has_text_format(fmt, TEXT_FORMAT_BOLD),
                    italic=has_text_format(fmt, TEXT_FORMAT_ITALIC),
                    underline=has_text_format(fmt, TEXT_FORMAT_UNDERLINE),
                    color=inline_styles.get("color"),
                    font_size=inline_styles.get("font-size"),
                )
            )

        elif child_type == "data-reference":
            field = (
                child.get("fieldName")
                or child.get("field_name")
                or child.get("path")
                or child.get("text")
                or ""
            )
            if not field:
                continue
            text = resolve_placeholder_value(str(field), data)
            ref_styles = child.get("styles", {}) or {}
            normalized = normalize_label_styles(ref_styles)

            spans.append(
                RichTextSpan(
                    text=text,
                    bold=normalized.get("font-weight") in ("bold", "700"),
                    italic=normalized.get("font-style") == "italic",
                    underline=normalized.get("text-decoration") == "underline",
                    color=normalized.get("color"),
                    font_size=normalized.get("font-size"),
                )
            )

    return spans


# ---------------------------------------------------------------------------
# Plain text label extraction (fallback)
# ---------------------------------------------------------------------------


def _extract_label(
    node_id: str, data: dict[str, Any], lexical_state: dict[str, Any]
) -> str:
    for key in (f"{node_id}-main", node_id):
        editor_state = lexical_state.get(key)
        if editor_state:
            text = _lexical_to_plain_text(editor_state)
            if text:
                return _resolve_known_placeholders(text, data)

    initial_text_content = data.get("initialTextContent") or data.get(
        "initial_text_content"
    )
    if initial_text_content:
        text = _lexical_to_plain_text(initial_text_content)
        if text:
            return _resolve_known_placeholders(text, data)

    for key in ("label", "displayName", "modelId", "model_id"):
        value = data.get(key)
        if value not in (None, ""):
            return str(value)

    if data.get("appLabel") and data.get("modelName"):
        return f"{data['appLabel']}.{data['modelName']}"
    if data.get("app_label") and data.get("model_name"):
        return f"{data['app_label']}.{data['model_name']}"

    return ""


def _lexical_to_plain_text(editor_state: Any) -> str:
    parsed = parse_lexical_json(editor_state)
    if parsed is None:
        return ""

    root = parsed.get("root", parsed)
    return extract_text_recursive(root).strip()


def _resolve_known_placeholders(text: str, data: dict[str, Any]) -> str:
    return resolve_known_placeholders(text, data)


def _strip_html_breaks(value: str) -> str:
    return value.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _to_float(value: Any, default: float | None = None) -> float | None:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip().lower().replace("px", "")
        try:
            return float(stripped)
        except ValueError:
            return default
    return default


def _to_color(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback
