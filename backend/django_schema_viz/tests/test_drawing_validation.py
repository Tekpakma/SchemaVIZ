from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
import json
from rest_framework.test import APITestCase

from django_schema_viz.models import Drawing

User = get_user_model()


class DrawingValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="drawing-owner", email="drawing-owner@example.com"
        )
        self.client.force_authenticate(self.user)

    def build_payload(self):
        return {
            "title": "Validated drawing",
            "description": "",
            "reactFlowState": {
                "nodes": [
                    {
                        "id": "node-1",
                        "type": "discover",
                        "position": {"x": 10, "y": 20},
                        "data": {"label": "Node 1"},
                    },
                    {
                        "id": "node-2",
                        "type": "discover",
                        "position": {"x": 200, "y": 20},
                        "data": {"label": "Node 2"},
                    },
                ],
                "edges": [
                    {
                        "id": "edge-1",
                        "source": "node-1",
                        "target": "node-2",
                    }
                ],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            "lexicalState": {
                "node-1": {
                    "root": {
                        "type": "root",
                        "version": 1,
                        "children": [],
                        "direction": None,
                        "format": "",
                        "indent": 0,
                    }
                }
            },
        }

    def test_create_rejects_missing_viewport_zoom(self):
        payload = self.build_payload()
        del payload["reactFlowState"]["viewport"]["zoom"]

        response = self.client.post("/schema-viz/drawings/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("viewport.zoom", str(response.json()))

    def test_create_rejects_edges_that_reference_missing_nodes(self):
        payload = self.build_payload()
        payload["reactFlowState"]["edges"][0]["target"] = "missing-node"

        response = self.client.post("/schema-viz/drawings/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("reference existing node ids", str(response.json()))

    def test_create_rejects_lexical_state_for_unknown_node(self):
        payload = self.build_payload()
        payload["lexicalState"] = {
            "missing-node": payload["lexicalState"]["node-1"],
        }

        response = self.client.post("/schema-viz/drawings/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("must match an existing node id", str(response.json()))

    def test_patch_allows_title_only_update_without_resubmitting_drawing_state(self):
        drawing = Drawing.objects.create(
            title="Original title",
            description="",
            react_flow_state=self.build_payload()["reactFlowState"],
            lexical_state=self.build_payload()["lexicalState"],
            owner=self.user,
        )

        response = self.client.patch(
            f"/schema-viz/drawings/{drawing.id}/",
            {"title": "Renamed drawing"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Renamed drawing")

    def test_import_endpoint_creates_saved_drawing_from_drawing_file(self):
        payload = {
            "format": "schemeviz/drawing",
            "version": 1,
            "appName": "SchemeViz",
            "savedAt": "2026-03-12T10:15:00Z",
            "content": self.build_payload(),
        }
        uploaded_file = SimpleUploadedFile(
            "import.schemeviz",
            json.dumps(payload).encode("utf-8"),
            content_type="application/vnd.schemeviz+json",
        )

        response = self.client.post(
            "/schema-viz/drawings/import/",
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["title"], payload["content"]["title"])
        self.assertTrue(
            Drawing.objects.filter(
                owner=self.user,
                title=payload["content"]["title"],
            ).exists()
        )

    def test_import_endpoint_rejects_invalid_schemeviz_version(self):
        payload = {
            "format": "schemeviz/drawing",
            "version": 99,
            "appName": "SchemeViz",
            "savedAt": "2026-03-12T10:15:00Z",
            "content": self.build_payload(),
        }
        uploaded_file = SimpleUploadedFile(
            "import.schemeviz",
            json.dumps(payload).encode("utf-8"),
            content_type="application/vnd.schemeviz+json",
        )

        response = self.client.post(
            "/schema-viz/drawings/import/",
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported SchemeViz file version", str(response.json()))
