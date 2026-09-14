"""
Shape Registry — single source of truth for shape definitions.

Each shape key maps to:
  - drawio_style: The mxCell style string for draw.io export
  - svg_viewbox / svg_elements: SVG rendering primitives for SVG export
  - label: Human-readable name
  - default_size: (width, height) default dimensions
  - category: Grouping for UI display

The same keys are used on the frontend (shapeRegistry.ts) for SVG rendering.
SVG element data here mirrors frontend/src/reactFlow/nodes/shapes.tsx exactly.

draw.io style reference:
  Built-in shapes use key=value pairs separated by semicolons.
  Common keys: shape, rounded, whiteSpace, html, fillColor, strokeColor,
               fontColor, fontSize, verticalLabelPosition, labelPosition, align, etc.
  Built-in shape values: cylinder3, cloud, hexagon, mxgraph.*, etc.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SvgElement:
    """A single SVG primitive within a shape definition."""

    tag: str  # "path", "ellipse", "rect", "line"
    attrs: dict[str, str] = field(default_factory=dict)
    fill_mode: str = "fill"  # "fill" = use node fill color, "none" = fill=none
    stroke_mode: str = "stroke"  # "stroke" = use node stroke color, "none" = no stroke
    stroke_dasharray: str | None = None


@dataclass(frozen=True)
class ShapeDefinition:
    """Definition of a shape for export (draw.io + SVG)."""

    key: str
    label: str
    drawio_style: str
    default_width: int
    default_height: int
    category: str
    # SVG rendering data (None / empty means use default rect rendering)
    svg_viewbox: str | None = None
    svg_elements: tuple[SvgElement, ...] = ()
    svg_stroke_width: float = 1.0


# ============================================================================
# SHAPE REGISTRY
# ============================================================================

_SHAPES: list[ShapeDefinition] = [
    ShapeDefinition(
        key="default",
        label="Rectangle",
        drawio_style="rounded=0;whiteSpace=wrap;html=1;",
        default_width=120,
        default_height=60,
        category="general",
        # No svg_elements — default uses <rect> with border-radius from node style.
    ),
    ShapeDefinition(
        key="cylinder",
        label="Cylinder",
        drawio_style="shape=cylinder3;whiteSpace=wrap;html=1;"
        "boundedLbl=1;backgroundOutline=1;size=15;",
        default_width=80,
        default_height=100,
        category="infrastructure",
        svg_viewbox="18 17 84 106",
        svg_stroke_width=2.0,
        svg_elements=(
            # Bottom ellipse (drawn first so the body rect covers its top half)
            SvgElement(
                tag="ellipse",
                attrs={"cx": "60", "cy": "110", "rx": "40", "ry": "12"},
            ),
            # Body rect (no stroke — sides drawn as separate lines)
            SvgElement(
                tag="rect",
                attrs={"x": "20", "y": "30", "width": "80", "height": "80"},
                stroke_mode="none",
            ),
            # Left side line
            SvgElement(
                tag="line",
                attrs={"x1": "20", "y1": "30", "x2": "20", "y2": "110"},
                fill_mode="none",
            ),
            # Right side line
            SvgElement(
                tag="line",
                attrs={"x1": "100", "y1": "30", "x2": "100", "y2": "110"},
                fill_mode="none",
            ),
            # Dashed internal ellipse 1
            SvgElement(
                tag="ellipse",
                attrs={"cx": "60", "cy": "60", "rx": "40", "ry": "12"},
                fill_mode="none",
                stroke_dasharray="4",
            ),
            # Dashed internal ellipse 2
            SvgElement(
                tag="ellipse",
                attrs={"cx": "60", "cy": "85", "rx": "40", "ry": "12"},
                fill_mode="none",
                stroke_dasharray="4",
            ),
            # Top ellipse (drawn last so it appears as the visible lid)
            SvgElement(
                tag="ellipse",
                attrs={"cx": "60", "cy": "30", "rx": "40", "ry": "12"},
            ),
        ),
    ),
    ShapeDefinition(
        key="cloud",
        label="Cloud",
        drawio_style="ellipse;shape=cloud;whiteSpace=wrap;html=1;",
        default_width=160,
        default_height=100,
        category="infrastructure",
        svg_viewbox="27 23 126 59",
        svg_stroke_width=3.0,
        svg_elements=(
            SvgElement(
                tag="path",
                attrs={
                    "d": (
                        "M 30,60 Q 30,40 50,40 Q 50,25 70,25 Q 90,25 100,35 "
                        "Q 120,30 130,45 Q 150,45 150,65 Q 150,80 130,80 "
                        "L 50,80 Q 30,80 30,60 Z"
                    ),
                },
            ),
        ),
    ),
    ShapeDefinition(
        key="server",
        label="Server",
        drawio_style="rounded=1;whiteSpace=wrap;html=1;arcSize=10;",
        default_width=80,
        default_height=100,
        category="infrastructure",
        svg_viewbox="0 0 80 100",
        svg_stroke_width=2.0,
        svg_elements=(
            # Chassis (rounded rect)
            SvgElement(
                tag="rect",
                attrs={
                    "x": "5",
                    "y": "5",
                    "width": "70",
                    "height": "90",
                    "rx": "4",
                    "ry": "4",
                },
            ),
            # Bay divider 1
            SvgElement(
                tag="line",
                attrs={"x1": "5", "y1": "35", "x2": "75", "y2": "35"},
                fill_mode="none",
            ),
            # Bay divider 2
            SvgElement(
                tag="line",
                attrs={"x1": "5", "y1": "65", "x2": "75", "y2": "65"},
                fill_mode="none",
            ),
            # LED bay 1
            SvgElement(
                tag="circle",
                attrs={"cx": "15", "cy": "20", "r": "3"},
                fill_mode="none",
            ),
            # LED bay 2
            SvgElement(
                tag="circle",
                attrs={"cx": "15", "cy": "50", "r": "3"},
                fill_mode="none",
            ),
            # LED bay 3
            SvgElement(
                tag="circle",
                attrs={"cx": "15", "cy": "80", "r": "3"},
                fill_mode="none",
            ),
        ),
    ),
    ShapeDefinition(
        key="hexagon",
        label="Hexagon",
        drawio_style="shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;"
        "html=1;fixedSize=1;size=20;",
        default_width=120,
        default_height=70,
        category="architecture",
        svg_viewbox="0 0 120 100",
        svg_stroke_width=2.0,
        svg_elements=(
            SvgElement(
                tag="path",
                attrs={"d": "M 22,4 L 98,4 L 116,50 L 98,96 L 22,96 L 4,50 Z"},
            ),
        ),
    ),
    ShapeDefinition(
        key="diamond",
        label="Diamond",
        drawio_style="rhombus;whiteSpace=wrap;html=1;",
        default_width=100,
        default_height=80,
        category="architecture",
        svg_viewbox="0 0 100 100",
        svg_stroke_width=2.0,
        svg_elements=(
            SvgElement(
                tag="path",
                attrs={"d": "M 50,3 L 97,50 L 50,97 L 3,50 Z"},
            ),
        ),
    ),
    ShapeDefinition(
        key="shield",
        label="Shield",
        drawio_style="rounded=1;whiteSpace=wrap;html=1;arcSize=40;",
        default_width=90,
        default_height=100,
        category="architecture",
        svg_viewbox="0 0 100 110",
        svg_stroke_width=2.0,
        svg_elements=(
            SvgElement(
                tag="path",
                attrs={
                    "d": (
                        "M 50,4 L 94,18 L 94,54 Q 94,88 50,106 "
                        "Q 6,88 6,54 L 6,18 Z"
                    ),
                },
            ),
        ),
    ),
    ShapeDefinition(
        key="queue",
        label="Queue",
        drawio_style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;"
        "backgroundOutline=1;size=15;direction=south;",
        default_width=120,
        default_height=60,
        category="architecture",
        svg_viewbox="0 0 120 60",
        svg_stroke_width=2.0,
        svg_elements=(
            # Left cap (drawn first so the body covers its right half)
            SvgElement(
                tag="ellipse",
                attrs={"cx": "16", "cy": "30", "rx": "12", "ry": "26"},
            ),
            SvgElement(
                tag="rect",
                attrs={"x": "16", "y": "4", "width": "88", "height": "52"},
                stroke_mode="none",
            ),
            SvgElement(
                tag="line",
                attrs={"x1": "16", "y1": "4", "x2": "104", "y2": "4"},
                fill_mode="none",
            ),
            SvgElement(
                tag="line",
                attrs={"x1": "16", "y1": "56", "x2": "104", "y2": "56"},
                fill_mode="none",
            ),
            # Right cap is the visible lid
            SvgElement(
                tag="ellipse",
                attrs={"cx": "104", "cy": "30", "rx": "12", "ry": "26"},
            ),
        ),
    ),
    ShapeDefinition(
        key="person",
        label="Person",
        drawio_style="shape=actor;whiteSpace=wrap;html=1;",
        default_width=80,
        default_height=100,
        category="architecture",
        svg_viewbox="0 0 100 110",
        svg_stroke_width=2.0,
        svg_elements=(
            SvgElement(
                tag="circle",
                attrs={"cx": "50", "cy": "26", "r": "18"},
            ),
            SvgElement(
                tag="path",
                attrs={"d": "M 10,106 Q 10,58 50,58 Q 90,58 90,106 Z"},
            ),
        ),
    ),
    ShapeDefinition(
        key="document",
        label="Document",
        drawio_style="shape=document;whiteSpace=wrap;html=1;boundedLbl=1;",
        default_width=100,
        default_height=110,
        category="architecture",
        svg_viewbox="0 0 100 110",
        svg_stroke_width=2.0,
        svg_elements=(
            SvgElement(
                tag="path",
                attrs={
                    "d": "M 4,4 L 96,4 L 96,90 Q 73,78 50,90 Q 27,102 4,90 Z",
                },
            ),
        ),
    ),
    ShapeDefinition(
        key="network",
        label="Network",
        drawio_style="rounded=1;whiteSpace=wrap;html=1;dashed=1;dashPattern=6 4;",
        default_width=120,
        default_height=80,
        category="architecture",
        svg_viewbox="0 0 120 80",
        svg_stroke_width=2.0,
        svg_elements=(
            SvgElement(
                tag="rect",
                attrs={
                    "x": "3",
                    "y": "3",
                    "width": "114",
                    "height": "74",
                    "rx": "10",
                    "ry": "10",
                },
                stroke_dasharray="6 4",
            ),
        ),
    ),
]

SHAPE_REGISTRY: dict[str, ShapeDefinition] = {s.key: s for s in _SHAPES}
SHAPE_ALIASES: dict[str, str] = {"database": "cylinder"}

SHAPE_KEYS: list[str] = [s.key for s in _SHAPES]

CATEGORIES: dict[str, list[ShapeDefinition]] = {}
for _shape in _SHAPES:
    CATEGORIES.setdefault(_shape.category, []).append(_shape)


def get_shape(key: str) -> ShapeDefinition:
    """Get a shape definition by key. Falls back to 'default' for unknown keys."""
    normalized_key = SHAPE_ALIASES.get(key, key)
    return SHAPE_REGISTRY.get(normalized_key, SHAPE_REGISTRY["default"])


def get_drawio_style(
    key: str,
    *,
    fill_color: str | None = None,
    stroke_color: str | None = None,
    font_color: str | None = None,
    opacity: int | None = None,
) -> str:
    """
    Build a complete draw.io style string for a shape key,
    with optional color overrides.
    """
    shape = get_shape(key)
    style = shape.drawio_style

    if fill_color:
        style += f"fillColor={fill_color};"
    if stroke_color:
        style += f"strokeColor={stroke_color};"
    if font_color:
        style += f"fontColor={font_color};"
    if opacity is not None:
        style += f"opacity={opacity};"

    return style
