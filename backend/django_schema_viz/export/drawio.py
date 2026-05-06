"""
draw.io Exporter — transforms a Drawing's react_flow_state + lexical_state
into a valid .drawio XML file (mxGraphModel format).

Usage:
    from django_schema_viz.export.drawio import export_drawing_to_drawio
    xml_string = export_drawing_to_drawio(drawing)

The exported XML can be opened directly in draw.io / diagrams.net.
"""

from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString
from typing import Any
from html import escape
import json
import re

from .shape_registry import get_drawio_style
from ._lexical_utils import (
    TEXT_FORMAT_BOLD,
    TEXT_FORMAT_ITALIC,
    TEXT_FORMAT_UNDERLINE,
    has_text_format as _has_text_format,
    parse_inline_style_string as _parse_inline_style_string,
    normalize_label_styles as _normalize_label_styles,
    normalize_style_key_to_css as _normalize_style_key_to_css,
    serialize_inline_label_styles as _serialize_inline_label_styles,
    resolve_known_placeholders as _resolve_known_placeholders,
    resolve_placeholder_value as _resolve_placeholder_value,
    normalize_text_alignment as _normalize_text_alignment,
    parse_lexical_json,
    extract_text_recursive as _extract_text_recursive,
)


def export_drawing_to_drawio(
    react_flow_state: dict[str, Any],
    lexical_state: dict[str, Any] | None = None,
) -> str:
    """
    Convert a Drawing's state into draw.io XML.

    Args:
        react_flow_state: The serialized ReactFlow state containing nodes, edges, viewport.
        lexical_state: Optional map of node_id -> Lexical editor state for text labels.

    Returns:
        A string of valid draw.io XML (mxGraphModel).
    """
    lexical_state = lexical_state or {}

    nodes: list[dict] = react_flow_state.get("nodes", [])
    edges: list[dict] = react_flow_state.get("edges", [])
    viewport: dict = react_flow_state.get("viewport", {})

    # Build mxGraphModel
    model = Element("mxGraphModel")
    model.set("dx", str(int(viewport.get("x", 0))))
    model.set("dy", str(int(viewport.get("y", 0))))
    model.set("grid", "1")
    model.set("gridSize", "10")
    model.set("guides", "1")
    model.set("tooltips", "1")
    model.set("connect", "1")
    model.set("arrows", "1")
    model.set("fold", "1")
    model.set("page", "1")
    model.set("pageScale", "1")
    model.set("pageWidth", "1169")
    model.set("pageHeight", "827")

    root = SubElement(model, "root")

    # Required root cells (draw.io convention)
    cell_0 = SubElement(root, "mxCell")
    cell_0.set("id", "0")

    cell_1 = SubElement(root, "mxCell")
    cell_1.set("id", "1")
    cell_1.set("parent", "0")

    # Track cell IDs for edge references
    node_id_map: dict[str, str] = {}

    # Process nodes — groups first so children can reference parent
    sorted_nodes = _sort_nodes_parents_first(nodes)

    for idx, node in enumerate(sorted_nodes):
        node_id = node.get("id", f"node_{idx}")
        cell_id = f"cell_{idx + 2}"  # offset by 2 for root cells
        node_id_map[node_id] = cell_id

        node_type = node.get("type", "")
        data = node.get("data", {})
        style_obj = node.get("style", {})
        position = node.get("position", {})

        # Determine parent (for grouped nodes)
        parent_id = node.get("parentId") or node.get("parentNode")
        parent_cell = node_id_map.get(parent_id, "1") if parent_id else "1"

        # Extract label
        label = _extract_label(node_id, data, lexical_state)

        # Build style string
        if node_type == "group":
            style = _build_group_style(data, style_obj)
        else:
            style = _build_node_style(data, style_obj)

        # Dimensions
        width, height = _get_dimensions(node)

        # Create mxCell
        cell = SubElement(root, "mxCell")
        cell.set("id", cell_id)
        cell.set("value", label)
        cell.set("style", style)
        cell.set("vertex", "1")
        cell.set("parent", parent_cell)

        if node_type == "group":
            cell.set("connectable", "0")

        geo = SubElement(cell, "mxGeometry")
        geo.set("x", str(round(position.get("x", 0))))
        geo.set("y", str(round(position.get("y", 0))))
        geo.set("width", str(round(width)))
        geo.set("height", str(round(height)))
        geo.set("as", "geometry")

    # Process edges
    for idx, edge in enumerate(edges):
        edge_id = f"edge_{idx}"
        source_id = edge.get("source", "")
        target_id = edge.get("target", "")

        source_cell = node_id_map.get(source_id)
        target_cell = node_id_map.get(target_id)

        if not source_cell or not target_cell:
            continue

        style = _build_edge_style(edge)
        label = edge.get("label", "")

        cell = SubElement(root, "mxCell")
        cell.set("id", edge_id)
        cell.set("value", label)
        cell.set("style", style)
        cell.set("edge", "1")
        cell.set("parent", "1")
        cell.set("source", source_cell)
        cell.set("target", target_cell)

        geo = SubElement(cell, "mxGeometry")
        geo.set("relative", "1")
        geo.set("as", "geometry")
        _append_edge_geometry_points(geo, edge)

    # Serialize to XML string
    raw_xml = tostring(model, encoding="unicode")
    return parseString(raw_xml).toprettyxml(indent="  ", encoding=None)


# ============================================================================
# INTERNAL HELPERS
# ============================================================================


def _sort_nodes_parents_first(nodes: list[dict]) -> list[dict]:
    """Sort so parent/group nodes come before their children."""
    groups = []
    children = []
    for node in nodes:
        if node.get("type") == "group":
            groups.append(node)
        else:
            children.append(node)
    return groups + children


def _extract_label(
    node_id: str,
    data: dict,
    lexical_state: dict[str, Any],
) -> str:
    """
    Extract display text for a node.

    Priority:
    1. Lexical editor state (formatted HTML extraction)
    2. data.label or data.modelName
    3. Empty string
    """
    # Try Lexical state first — look for both 'nodeId-main' and 'nodeId' keys
    for key in (f"{node_id}-main", node_id):
        editor_state = lexical_state.get(key)
        if editor_state:
            rich_label = _lexical_to_drawio_html(editor_state, data)
            if rich_label:
                return rich_label
            text = _lexical_to_plain_text(editor_state)
            if text:
                return _to_drawio_label(_resolve_known_placeholders(text, data))

    # Fallback to persisted initial text content in node data.
    initial_text_content = data.get("initialTextContent") or data.get("initial_text_content")
    if initial_text_content:
        rich_label = _lexical_to_drawio_html(initial_text_content, data)
        if rich_label:
            return rich_label
        text = _lexical_to_plain_text(initial_text_content)
        if text:
            return _to_drawio_label(_resolve_known_placeholders(text, data))

    # Fallback to data fields
    if data.get("label"):
        return _to_drawio_label(str(data["label"]))
    if data.get("displayName"):
        return _to_drawio_label(str(data["displayName"]))
    if data.get("modelId"):
        return _to_drawio_label(str(data["modelId"]))
    if data.get("model_id"):
        return _to_drawio_label(str(data["model_id"]))
    if data.get("modelName"):
        return _to_drawio_label(str(data["modelName"]))
    if data.get("model_name"):
        return _to_drawio_label(str(data["model_name"]))
    if data.get("appLabel") and data.get("modelName"):
        return _to_drawio_label(f"{data['appLabel']}.{data['modelName']}")
    if data.get("app_label") and data.get("model_name"):
        return _to_drawio_label(f"{data['app_label']}.{data['model_name']}")

    return ""


def _lexical_to_drawio_html(editor_state: Any, data: dict[str, Any]) -> str:
    """
    Render serialized Lexical content into draw.io HTML labels.
    draw.io expects the HTML to be XML-escaped in the mxCell value attribute.
    """
    parsed = parse_lexical_json(editor_state)
    if parsed is None:
        return ""

    root = parsed.get("root", parsed)
    return _strip_trailing_html_breaks(_render_lexical_html_node(root, data).strip())


def _lexical_to_plain_text(editor_state: Any) -> str:
    """
    Extract plain text from a serialized Lexical editor state.
    Handles the common JSON structure with root -> children -> text nodes.
    """
    parsed = parse_lexical_json(editor_state)
    if parsed is None:
        return ""

    root = parsed.get("root", parsed)
    return _extract_text_recursive(root).strip()


def _render_lexical_html_node(node: Any, data: dict[str, Any]) -> str:
    if not isinstance(node, dict):
        return ""

    node_type = node.get("type")
    if node_type == "text":
        text = _resolve_known_placeholders(str(node.get("text", "")), data)
        if not text:
            return ""
        styles = _normalize_label_styles(_parse_inline_style_string(node.get("style", "")))
        if _has_text_format(node.get("format"), TEXT_FORMAT_BOLD):
            styles["font-weight"] = "bold"
        if _has_text_format(node.get("format"), TEXT_FORMAT_ITALIC):
            styles["font-style"] = "italic"
        if _has_text_format(node.get("format"), TEXT_FORMAT_UNDERLINE):
            styles["text-decoration"] = "underline"
        return _wrap_html_with_styles(escape(text, quote=False), styles)

    if node_type == "linebreak":
        return "<br>"

    if node_type == "data-reference":
        field = (
            node.get("fieldName")
            or node.get("field_name")
            or node.get("path")
            or node.get("text")
            or ""
        )
        if not field:
            return ""
        text = _resolve_placeholder_value(str(field), data)
        styles = _normalize_label_styles(node.get("styles", {}))
        return _wrap_html_with_styles(escape(text, quote=False), styles)

    child_html = "".join(
        _render_lexical_html_node(child, data) for child in node.get("children", [])
    )
    if node_type in {"paragraph", "heading"}:
        if not child_html:
            return ""
        alignment = _normalize_text_alignment(node.get("format"))
        if alignment:
            return f'<div style="text-align:{alignment};">{child_html}</div>'
        return f"{child_html}<br>"

    return child_html


def _to_drawio_label(text: str) -> str:
    """
    draw.io labels are rendered with html=1 in styles; convert line breaks
    to <br> while keeping the rest as plain text.
    """
    return escape(text, quote=False).replace("\n", "<br>")




def _strip_trailing_html_breaks(value: str) -> str:
    return re.sub(r"(?:<br\s*/?>)+$", "", value)




def _wrap_html_with_styles(text: str, styles: dict[str, str]) -> str:
    if not text:
        return ""
    if not styles:
        return text
    return f'<span style="{_serialize_inline_label_styles(styles)}">{text}</span>'


def _css_color_to_hex(value: Any) -> str | None:
    """
    Best-effort conversion of CSS color values to hex.
    Returns None if it can't be converted.
    """
    if not isinstance(value, str):
        return None
    value = value.strip()

    # Already hex
    if value.startswith("#") and len(value) in (4, 7, 9):
        return value

    # Named colors (subset for common ones)
    named = {
        "red": "#FF0000",
        "blue": "#0000FF",
        "green": "#008000",
        "white": "#FFFFFF",
        "black": "#000000",
        "yellow": "#FFFF00",
        "orange": "#FFA500",
        "purple": "#800080",
        "gray": "#808080",
        "grey": "#808080",
        "transparent": "none",
    }
    if value.lower() in named:
        return named[value.lower()]

    return None


def _build_node_style(data: dict, style_obj: dict) -> str:
    """Build draw.io style string for a regular node."""
    shape_key = data.get("shape", "default")

    # Extract colors from React style object
    fill_color = _css_color_to_hex(style_obj.get("backgroundColor"))
    stroke_color = _css_color_to_hex(style_obj.get("borderColor"))
    font_color = _css_color_to_hex(style_obj.get("color"))

    # Also check data-level colors (from shape system)
    if not fill_color and data.get("color"):
        fill_color = _css_color_to_hex(data["color"])
    if not stroke_color and data.get("borderColor"):
        stroke_color = _css_color_to_hex(data["borderColor"])

    # Opacity from style
    opacity = None
    if "opacity" in style_obj:
        try:
            opacity = int(float(style_obj["opacity"]) * 100)
        except (ValueError, TypeError):
            pass

    return get_drawio_style(
        shape_key,
        fill_color=fill_color,
        stroke_color=stroke_color,
        font_color=font_color,
        opacity=opacity,
    )


def _build_group_style(data: dict, style_obj: dict) -> str:
    """Build draw.io style for a group/container node."""
    base = "group;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;"

    fill_color = _css_color_to_hex(style_obj.get("backgroundColor"))
    stroke_color = _css_color_to_hex(style_obj.get("borderColor"))

    if fill_color:
        base += f"fillColor={fill_color};"
    else:
        base += "fillColor=none;"

    if stroke_color:
        base += f"strokeColor={stroke_color};"
    else:
        base += "strokeColor=#666666;dashed=1;"

    return base


def _build_edge_style(edge: dict) -> str:
    """Build draw.io style for an edge/connector."""
    edge_type = edge.get("type", "")
    style_obj = edge.get("style", {})
    animated = edge.get("animated", False)

    # Base edge style
    parts = [
        "edgeStyle=orthogonalEdgeStyle",
        "rounded=1",
        "orthogonalLoop=1",
        "jettySize=auto",
        "html=1",
    ]

    # Stroke color
    stroke = _css_color_to_hex(style_obj.get("stroke"))
    if stroke:
        parts.append(f"strokeColor={stroke}")

    # Stroke width
    stroke_width = style_obj.get("strokeWidth")
    if stroke_width:
        parts.append(f"strokeWidth={stroke_width}")

    # Animated → dashed in draw.io
    if animated:
        parts.append("dashed=1")
        parts.append("dashPattern=8 8")

    # Smooth step edges → curved in draw.io
    if edge_type == "smoothstep":
        parts.append("curved=1")

    return ";".join(parts) + ";"


def _get_elk_sections(edge: dict) -> list[dict[str, Any]]:
    data = edge.get("data", {}) or {}
    sections = data.get("elkSections") or data.get("elk_sections") or []
    return sections if isinstance(sections, list) else []


def _format_drawio_coord(value: Any) -> str:
    try:
        number = round(float(value), 2)
    except (TypeError, ValueError):
        number = 0
    if float(number).is_integer():
        return str(int(number))
    return str(number)


def _append_edge_geometry_points(geo: Element, edge: dict) -> None:
    """Preserve React Flow/ELK edge routing in draw.io geometry when available."""
    sections = _get_elk_sections(edge)
    if not sections:
        return

    section = sections[0]
    if not isinstance(section, dict):
        return

    start = section.get("startPoint") or section.get("start_point")
    end = section.get("endPoint") or section.get("end_point")
    bend_points = section.get("bendPoints") or section.get("bend_points") or []

    if isinstance(start, dict):
        source_point = SubElement(geo, "mxPoint")
        source_point.set("x", _format_drawio_coord(start.get("x")))
        source_point.set("y", _format_drawio_coord(start.get("y")))
        source_point.set("as", "sourcePoint")

    if isinstance(end, dict):
        target_point = SubElement(geo, "mxPoint")
        target_point.set("x", _format_drawio_coord(end.get("x")))
        target_point.set("y", _format_drawio_coord(end.get("y")))
        target_point.set("as", "targetPoint")

    if not isinstance(bend_points, list) or not bend_points:
        return

    points = SubElement(geo, "Array")
    points.set("as", "points")
    for point in bend_points:
        if not isinstance(point, dict):
            continue
        mx_point = SubElement(points, "mxPoint")
        mx_point.set("x", _format_drawio_coord(point.get("x")))
        mx_point.set("y", _format_drawio_coord(point.get("y")))


def _get_dimensions(node: dict) -> tuple[float, float]:
    """
    Extract node dimensions from various possible sources.
    Priority: explicit width/height > measured > style > defaults.
    """
    # Direct properties
    width = node.get("width")
    height = node.get("height")
    if width and height:
        return (width, height)

    # Measured dimensions
    measured = node.get("measured", {})
    if measured:
        w = measured.get("width")
        h = measured.get("height")
        if w and h:
            return (w, h)

    # Style dimensions
    style = node.get("style", {})
    w = style.get("width")
    h = style.get("height")
    if w and h:
        if isinstance(w, str):
            w = int(w.replace("px", ""))
        if isinstance(h, str):
            h = int(h.replace("px", ""))
        return (w, h)

    # Shape defaults
    from .shape_registry import get_shape

    shape_key = node.get("data", {}).get("shape", "default")
    shape = get_shape(shape_key)
    return (shape.default_width, shape.default_height)
