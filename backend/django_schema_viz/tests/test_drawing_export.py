from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase
import json

from django_schema_viz.models import Drawing
from django_schema_viz.export.drawio import export_drawing_to_drawio
from django_schema_viz.export.svg import _polyline_midpoint

User = get_user_model()


class DrawingExportViewTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com"
        )
        self.other = User.objects.create_user(
            username="other", email="other@example.com"
        )
        self.drawing = Drawing.objects.create(
            title="Test Drawing",
            description="for export",
            react_flow_state={"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0}},
            lexical_state={},
            owner=self.owner,
        )

    def test_requires_authentication(self):
        response = self.client.get(f"/schema-viz/drawings/{self.drawing.id}/export/")
        self.assertEqual(response.status_code, 401)

    def test_owner_can_export(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/schema-viz/drawings/{self.drawing.id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        self.assertIn("attachment;", response["Content-Disposition"])

    def test_owner_can_export_with_export_format_query_param(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{self.drawing.id}/export/?exportFormat=drawio"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        self.assertIn("attachment;", response["Content-Disposition"])

    def test_owner_can_export_with_legacy_format_query_param(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{self.drawing.id}/export/?format=drawio"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        self.assertIn("attachment;", response["Content-Disposition"])

    def test_owner_can_export_as_svg(self):
        drawing = Drawing.objects.create(
            title="SVG Export",
            description="svg test",
            react_flow_state={
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 100, "y": 80},
                        "width": 200,
                        "height": 100,
                        "data": {"label": "Node A"},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=1200&height=800"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertIn("attachment;", response["Content-Disposition"])
        self.assertIn(b"<svg", response.content)
        self.assertIn(b"Node A", response.content)
        self.assertIn(b'width="1200"', response.content)
        self.assertIn(b'height="800"', response.content)

    def test_svg_export_rejects_invalid_mode(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{self.drawing.id}/export/?exportFormat=svg&mode=weird"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported mode", response.json()["error"])

    def test_svg_export_rejects_too_small_dimensions(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{self.drawing.id}/export/?exportFormat=svg&width=200&height=800"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("width must be between", response.json()["error"])

    def test_svg_export_rejects_excessive_dimensions(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{self.drawing.id}/export/?exportFormat=svg&width=9000&height=2000"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("width must be between", response.json()["error"])

    def test_svg_export_rejects_excessive_total_pixels(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{self.drawing.id}/export/?exportFormat=svg&width=8000&height=8000"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("width*height exceeds maximum export pixels", response.json()["error"])

    def test_svg_export_uses_discover_bottom_to_top_anchors(self):
        drawing = Drawing.objects.create(
            title="SVG Anchors",
            description="anchor test",
            react_flow_state={
                "nodes": [
                    {
                        "id": "source-node",
                        "type": "discover",
                        "position": {"x": 100, "y": 80},
                        "width": 200,
                        "height": 100,
                        "data": {"label": "Source"},
                    },
                    {
                        "id": "target-node",
                        "type": "discover",
                        "position": {"x": 600, "y": 320},
                        "width": 200,
                        "height": 100,
                        "data": {"label": "Target"},
                    },
                ],
                "edges": [
                    {
                        "id": "edge-1",
                        "source": "source-node",
                        "target": "target-node",
                        "type": "default",
                        "label": "rel",
                    }
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=1200&height=800&mode=current"
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        # source anchor should be bottom-center of source node: (200, 180)
        self.assertIn("M 200.00 180.00", content)
        # target anchor should be top-center of target node: (700, 320)
        self.assertIn("700.00 320.00", content)

    def test_non_owner_gets_not_found(self):
        self.client.force_authenticate(self.other)
        response = self.client.get(f"/schema-viz/drawings/{self.drawing.id}/export/")
        self.assertEqual(response.status_code, 404)

    def test_export_uses_initial_text_content_when_lexical_state_missing(self):
        drawing = Drawing.objects.create(
            title="Initial Text Fallback",
            description="fallback test",
            react_flow_state={
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "initial_text_content": json.dumps(
                                {
                                    "root": {
                                        "type": "root",
                                        "children": [
                                            {
                                                "type": "paragraph",
                                                "children": [
                                                    {"type": "text", "text": "Hello Export"}
                                                ],
                                            }
                                        ],
                                    }
                                }
                            )
                        },
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/schema-viz/drawings/{drawing.id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Hello Export", response.content)

    def test_export_preserves_lexical_text_formatting_in_drawio_labels(self):
        drawing = Drawing.objects.create(
            title="Formatted Export",
            description="formatted lexical export",
            react_flow_state={
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "model_id": "42",
                        },
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "node-1-main": {
                    "root": {
                        "type": "root",
                        "version": 1,
                        "direction": "ltr",
                        "format": "",
                        "indent": 0,
                        "children": [
                            {
                                "type": "paragraph",
                                "version": 1,
                                "direction": "ltr",
                                "format": "center",
                                "indent": 0,
                                "children": [
                                    {
                                        "type": "text",
                                        "version": 1,
                                        "detail": 0,
                                        "mode": "normal",
                                        "format": 1,
                                        "style": "color: #123456; font-size: 16px",
                                        "text": "Title ",
                                    },
                                    {
                                        "type": "data-reference",
                                        "version": 1,
                                        "path": "id",
                                        "styles": {
                                            "color": "#cc1d70",
                                            "textDecoration": "underline",
                                        },
                                    },
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/schema-viz/drawings/{drawing.id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"text-align:center", response.content)
        self.assertIn(b"font-weight:bold", response.content)
        self.assertIn(b"color:#123456", response.content)
        self.assertIn(b"font-size:16px", response.content)
        self.assertIn(b"color:#cc1d70", response.content)
        self.assertIn(b"text-decoration:underline", response.content)
        self.assertIn(b"Title", response.content)
        self.assertIn(b"42", response.content)

    def test_export_uses_snake_case_model_id_fallback(self):
        drawing = Drawing.objects.create(
            title="Model ID Fallback",
            description="fallback test",
            react_flow_state={
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "app_label": "infrastructure",
                            "model_name": "cloudprovider",
                            "model_id": "42",
                        },
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/schema-viz/drawings/{drawing.id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'value="42"', response.content)

    def test_export_resolves_id_placeholder_from_model_id(self):
        drawing = Drawing.objects.create(
            title="Placeholder Resolution",
            description="placeholder test",
            react_flow_state={
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "model_id": "7",
                            "initial_text_content": json.dumps(
                                {
                                    "root": {
                                        "type": "root",
                                        "children": [
                                            {
                                                "type": "paragraph",
                                                "children": [
                                                    {
                                                        "type": "data-reference",
                                                        "path": "id",
                                                    }
                                                ],
                                            }
                                        ],
                                    }
                                }
                            ),
                        },
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/schema-viz/drawings/{drawing.id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'value="7"', response.content)

    def test_drawio_export_resolves_record_field_placeholders_from_node_data(self):
        xml = export_drawing_to_drawio(
            react_flow_state={
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "_record_fields": {"name": "server-01"},
                            "initial_text_content": json.dumps(
                                {
                                    "root": {
                                        "type": "root",
                                        "children": [
                                            {
                                                "type": "paragraph",
                                                "children": [
                                                    {"type": "text", "text": "{{name}}"}
                                                ],
                                            }
                                        ],
                                    }
                                }
                            ),
                        },
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0},
            },
            lexical_state={},
        )

        self.assertIn('value="server-01"', xml)
        self.assertNotIn("{{name}}", xml)

    def test_drawio_export_preserves_elk_edge_bend_points(self):
        xml = export_drawing_to_drawio(
            react_flow_state={
                "nodes": [
                    {
                        "id": "a",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "A"},
                    },
                    {
                        "id": "b",
                        "type": "discover",
                        "position": {"x": 300, "y": 300},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "B"},
                    },
                ],
                "edges": [
                    {
                        "id": "e1",
                        "source": "a",
                        "target": "b",
                        "type": "elk",
                        "data": {
                            "elkSections": [
                                {
                                    "startPoint": {"x": 50, "y": 50},
                                    "endPoint": {"x": 350, "y": 300},
                                    "bendPoints": [
                                        {"x": 50, "y": 175},
                                        {"x": 350, "y": 175},
                                    ],
                                }
                            ],
                        },
                    }
                ],
                "viewport": {"x": 0, "y": 0},
            },
            lexical_state={},
        )

        self.assertIn('as="sourcePoint"', xml)
        self.assertIn('as="targetPoint"', xml)
        self.assertIn('as="points"', xml)
        self.assertIn('x="50"', xml)
        self.assertIn('y="175"', xml)
        self.assertIn('x="350"', xml)

    # ------------------------------------------------------------------
    # Shape rendering tests
    # ------------------------------------------------------------------

    def test_svg_export_renders_cloud_shape_path(self):
        drawing = Drawing.objects.create(
            title="Cloud Shape",
            description="cloud",
            react_flow_state={
                "nodes": [
                    {
                        "id": "cloud-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 260,
                        "height": 120,
                        "data": {"shape": "cloud", "label": "My Cloud"},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        # Should contain a nested <svg> with cloud viewBox
        self.assertIn('viewBox="27 23 126 59"', content)
        # Should contain the cloud path
        self.assertIn("M 30,60 Q 30,40 50,40", content)
        self.assertIn("My Cloud", content)

    def test_svg_export_renders_cylinder_shape_elements(self):
        drawing = Drawing.objects.create(
            title="Cylinder Shape",
            description="cylinder",
            react_flow_state={
                "nodes": [
                    {
                        "id": "cyl-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 180,
                        "height": 220,
                        "data": {"shape": "cylinder", "label": "DB"},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        # Cylinder viewBox
        self.assertIn('viewBox="18 17 84 106"', content)
        # Top ellipse
        self.assertIn('cx="60"', content)
        self.assertIn('cy="30"', content)
        # Side lines
        self.assertIn("<line", content)
        # Dashed ellipses
        self.assertIn('stroke-dasharray="4"', content)
        self.assertIn("DB", content)

    def test_svg_export_default_shape_renders_rect(self):
        drawing = Drawing.objects.create(
            title="Default Shape",
            description="rect",
            react_flow_state={
                "nodes": [
                    {
                        "id": "rect-1",
                        "type": "discover",
                        "position": {"x": 50, "y": 50},
                        "width": 200,
                        "height": 100,
                        "data": {"label": "Rectangle"},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        # Default shape: no nested svg viewBox, just a <rect>
        self.assertNotIn('viewBox="27 23', content)
        self.assertNotIn('viewBox="18 17', content)
        self.assertIn("Rectangle", content)

    def test_svg_export_database_alias_renders_cylinder(self):
        """The 'database' alias should resolve to cylinder shape."""
        drawing = Drawing.objects.create(
            title="DB Alias",
            description="alias",
            react_flow_state={
                "nodes": [
                    {
                        "id": "db-1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 180,
                        "height": 220,
                        "data": {"shape": "database", "label": "Alias"},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        content = response.content.decode("utf-8")
        self.assertIn('viewBox="18 17 84 106"', content)

    # ------------------------------------------------------------------
    # ELK edge path tests
    # ------------------------------------------------------------------

    def test_svg_export_renders_elk_polyline_path(self):
        drawing = Drawing.objects.create(
            title="ELK Edge",
            description="elk",
            react_flow_state={
                "nodes": [
                    {
                        "id": "a",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "A"},
                    },
                    {
                        "id": "b",
                        "type": "discover",
                        "position": {"x": 300, "y": 300},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "B"},
                    },
                ],
                "edges": [
                    {
                        "id": "e1",
                        "source": "a",
                        "target": "b",
                        "type": "elk",
                        "data": {
                            "elkSections": [
                                {
                                    "startPoint": {"x": 50, "y": 50},
                                    "endPoint": {"x": 350, "y": 300},
                                    "bendPoints": [
                                        {"x": 50, "y": 175},
                                        {"x": 350, "y": 175},
                                    ],
                                }
                            ],
                        },
                    }
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        content = response.content.decode("utf-8")
        # Should be a polyline (M + L commands), NOT a cubic bezier (C)
        self.assertIn("M 50.00 50.00", content)
        self.assertIn("L 50.00 175.00", content)
        self.assertIn("L 350.00 175.00", content)
        self.assertIn("L 350.00 300.00", content)
        # Should NOT contain cubic bezier for this edge
        # (there might be no "C" in the edge path at all)

    def test_svg_export_elk_edge_with_label(self):
        drawing = Drawing.objects.create(
            title="ELK Label",
            description="elk label",
            react_flow_state={
                "nodes": [
                    {
                        "id": "a",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "A"},
                    },
                    {
                        "id": "b",
                        "type": "discover",
                        "position": {"x": 0, "y": 300},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "B"},
                    },
                ],
                "edges": [
                    {
                        "id": "e1",
                        "source": "a",
                        "target": "b",
                        "type": "elk",
                        "label": "has_many",
                        "data": {
                            "elkSections": [
                                {
                                    "startPoint": {"x": 50, "y": 50},
                                    "endPoint": {"x": 50, "y": 300},
                                }
                            ],
                        },
                    }
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        content = response.content.decode("utf-8")
        self.assertIn("has_many", content)

    def test_svg_export_fallback_to_smooth_step_when_no_elk_sections(self):
        drawing = Drawing.objects.create(
            title="No ELK",
            description="bezier fallback",
            react_flow_state={
                "nodes": [
                    {
                        "id": "a",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "A"},
                    },
                    {
                        "id": "b",
                        "type": "discover",
                        "position": {"x": 0, "y": 300},
                        "width": 100,
                        "height": 50,
                        "data": {"label": "B"},
                    },
                ],
                "edges": [
                    {
                        "id": "e1",
                        "source": "a",
                        "target": "b",
                        "type": "default",
                    }
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={},
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600&mode=current"
        )
        content = response.content.decode("utf-8")
        # Should contain SmoothStep path (L for straight segments)
        self.assertIn(" L ", content)

    # ------------------------------------------------------------------
    # Rich text SVG tests
    # ------------------------------------------------------------------

    def test_svg_export_renders_bold_text_in_tspan(self):
        drawing = Drawing.objects.create(
            title="Bold SVG",
            description="bold",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {"type": "text", "text": "Bold Text", "format": 1}
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        self.assertIn('font-weight="bold"', content)
        self.assertIn("Bold Text", content)

    def test_svg_export_renders_italic_text_in_tspan(self):
        drawing = Drawing.objects.create(
            title="Italic SVG",
            description="italic",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {"type": "text", "text": "Italic", "format": 2}
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        self.assertIn('font-style="italic"', content)

    def test_svg_export_renders_colored_text_in_tspan(self):
        drawing = Drawing.objects.create(
            title="Color SVG",
            description="color",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "type": "text",
                                        "text": "Red",
                                        "format": 0,
                                        "style": "color: #ff0000",
                                    }
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        self.assertIn('fill="#ff0000"', content)
        self.assertIn("Red", content)

    def test_svg_export_renders_data_reference_with_styles(self):
        drawing = Drawing.objects.create(
            title="DataRef SVG",
            description="dataref",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {"model_id": "99"},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "type": "data-reference",
                                        "path": "id",
                                        "styles": {
                                            "color": "#cc1d70",
                                            "textDecoration": "underline",
                                        },
                                    }
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        self.assertIn("99", content)
        self.assertIn('fill="#cc1d70"', content)
        self.assertIn('text-decoration="underline"', content)

    def test_svg_export_resolves_field_templates_from_db(self):
        """{{username}} should resolve to the actual record value."""
        drawing = Drawing.objects.create(
            title="Field Template",
            description="field template",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "appLabel": "auth",
                            "modelName": "user",
                            "modelId": str(self.owner.pk),
                        },
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "type": "data-reference",
                                        "path": "username",
                                        "styles": {},
                                    }
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        # Should contain the actual username, not {{username}}
        self.assertIn("owner", content)
        self.assertNotIn("{{username}}", content)

    def test_svg_export_text_alignment_left(self):
        drawing = Drawing.objects.create(
            title="Left Align",
            description="left",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "format": "left",
                                "children": [
                                    {"type": "text", "text": "Left"}
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        self.assertIn('text-anchor="start"', content)

    def test_svg_export_text_alignment_right(self):
        drawing = Drawing.objects.create(
            title="Right Align",
            description="right",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {},
                    }
                ],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            lexical_state={
                "n1-main": {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "format": "right",
                                "children": [
                                    {"type": "text", "text": "Right"}
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.owner,
        )
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/?exportFormat=svg&width=800&height=600"
        )
        content = response.content.decode("utf-8")
        self.assertIn('text-anchor="end"', content)


class PolylineMidpointTests(SimpleTestCase):
    """Unit tests for _polyline_midpoint helper."""

    def test_empty_returns_origin(self):
        self.assertEqual(_polyline_midpoint([]), (0.0, 0.0))

    def test_single_point_returns_itself(self):
        self.assertEqual(_polyline_midpoint([(5.0, 10.0)]), (5.0, 10.0))

    def test_simple_horizontal(self):
        result = _polyline_midpoint([(0.0, 0.0), (100.0, 0.0)])
        self.assertAlmostEqual(result[0], 50.0)
        self.assertAlmostEqual(result[1], 0.0)

    def test_l_shaped_path(self):
        # Total length: 100 (vertical) + 100 (horizontal) = 200
        # Midpoint at 100 should be at the bend
        points = [(0.0, 0.0), (0.0, 100.0), (100.0, 100.0)]
        result = _polyline_midpoint(points)
        self.assertAlmostEqual(result[0], 0.0)
        self.assertAlmostEqual(result[1], 100.0)

    def test_midpoint_on_second_segment(self):
        # 50 + 200 = 250 total, midpoint at 125
        # First segment covers 50, need 75 more into second (200 long)
        # ratio = 75/200 = 0.375
        points = [(0.0, 0.0), (0.0, 50.0), (200.0, 50.0)]
        result = _polyline_midpoint(points)
        self.assertAlmostEqual(result[0], 75.0, places=1)
        self.assertAlmostEqual(result[1], 50.0, places=1)


class StatelessExportViewTests(APITestCase):
    """Tests for POST /schema-viz/export/ — stateless canvas export."""

    EXPORT_URL = "/schema-viz/export/"

    SIMPLE_REACT_FLOW_STATE = {
        "nodes": [
            {
                "id": "node-1",
                "type": "discover",
                "position": {"x": 100, "y": 80},
                "width": 200,
                "height": 100,
                "data": {"label": "Node A"},
            }
        ],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }

    def setUp(self):
        self.user = User.objects.create_user(
            username="exporter", email="exporter@example.com"
        )

    def test_requires_authentication(self):
        response = self.client.post(
            self.EXPORT_URL,
            data={"reactFlowState": self.SIMPLE_REACT_FLOW_STATE},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_stateless_svg_export(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "exportFormat": "svg",
                "width": 1200,
                "height": 800,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertIn("attachment;", response["Content-Disposition"])
        self.assertIn(".svg", response["Content-Disposition"])
        content = response.content.decode("utf-8")
        self.assertIn("<svg", content)
        self.assertIn("Node A", content)

    def test_stateless_svg_export_preserves_record_field_keys(self):
        self.client.force_authenticate(self.user)
        state = {
            "nodes": [
                {
                    "id": "node-1",
                    "type": "discover",
                    "position": {"x": 100, "y": 80},
                    "width": 200,
                    "height": 100,
                    "data": {
                        "_record_fields": {"cidr_block": "10.2.0.0/16"},
                        "initialTextContent": json.dumps(
                            {
                                "root": {
                                    "type": "root",
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "children": [
                                                {
                                                    "type": "text",
                                                    "text": "{{cidr_block}}",
                                                }
                                            ],
                                        }
                                    ],
                                }
                            }
                        ),
                    },
                }
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }

        response = self.client.post(
            self.EXPORT_URL,
            data={"reactFlowState": state, "exportFormat": "svg"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("10.2.0.0/16", content)
        self.assertNotIn("{{cidr_block}}", content)

    def test_stateless_svg_export_default_format(self):
        """When exportFormat is omitted, SVG is the default."""
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={"reactFlowState": self.SIMPLE_REACT_FLOW_STATE},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")

    def test_stateless_drawio_export(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "exportFormat": "drawio",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        self.assertIn(".drawio", response["Content-Disposition"])

    def test_stateless_export_custom_file_name(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "exportFormat": "svg",
                "fileName": "my-diagram",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("my-diagram.svg", response["Content-Disposition"])

    def test_stateless_export_missing_react_flow_state(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={"exportFormat": "svg"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_stateless_export_empty_react_flow_state(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={"reactFlowState": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_stateless_export_width_too_small(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "width": 100,
                "height": 600,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_stateless_export_width_too_large(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "width": 9000,
                "height": 600,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_stateless_export_exceeds_max_pixels(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "width": 8000,
                "height": 8000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_stateless_export_with_lexical_state(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "lexicalState": {"node-1": {"root": {"children": []}}},
                "exportFormat": "svg",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")

    def test_stateless_export_with_edges(self):
        state = {
            "nodes": [
                {
                    "id": "n1",
                    "type": "discover",
                    "position": {"x": 0, "y": 0},
                    "width": 200,
                    "height": 100,
                    "data": {"label": "A"},
                },
                {
                    "id": "n2",
                    "type": "discover",
                    "position": {"x": 400, "y": 0},
                    "width": 200,
                    "height": 100,
                    "data": {"label": "B"},
                },
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "n1",
                    "target": "n2",
                    "data": {"relationName": "has_many"},
                }
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={"reactFlowState": state, "exportFormat": "svg"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("<svg", content)
        self.assertIn("has_many", content)

    def test_stateless_export_with_scale_factor(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "exportFormat": "svg",
                "scaleFactor": 2.0,
                "width": 1920,
                "height": 1080,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        content = response.content.decode("utf-8")
        self.assertIn("<svg", content)

    def test_stateless_export_scale_factor_out_of_range(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "scaleFactor": 5.0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_stateless_export_dark_background(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "exportFormat": "svg",
                "background": "#151114",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("<svg", content)
        # Dark background rect should be present
        self.assertIn('fill="#151114"', content)
        # Dark palette fallback text color (node text)
        self.assertIn("#f5eff3", content)

    def test_stateless_export_transparent_background(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "exportFormat": "svg",
                "background": "transparent",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("<svg", content)
        # No background rect should be emitted for transparent
        self.assertNotIn('fill="transparent"', content)

    def test_stateless_export_invalid_background(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.EXPORT_URL,
            data={
                "reactFlowState": self.SIMPLE_REACT_FLOW_STATE,
                "background": "not-a-color",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
