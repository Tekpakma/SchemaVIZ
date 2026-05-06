import uuid

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.models import Drawing, GenerationTemplate
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()


def build_drawing_payload(**overrides):
    payload = {
        "title": "Validated drawing",
        "description": "",
        "reactFlowState": {
            "nodes": [
                {
                    "id": "node-1",
                    "type": "discover",
                    "position": {"x": 10, "y": 20},
                    "data": {"label": "Node 1"},
                }
            ],
            "edges": [],
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
    payload.update(overrides)
    return payload


def build_style_payload(**overrides):
    payload = {
        "name": "Server Card",
        "description": "",
        "visualStyles": {"backgroundColor": "#ffffff"},
        "dimensions": {"width": 220, "height": 120},
        "textContent": None,
        "requiredFields": [],
        "isGlobal": False,
    }
    payload.update(overrides)
    return payload


def build_generation_payload(**overrides):
    payload = {
        "name": "Network Overview",
        "description": "",
        "rootModel": "auth.User",
        "shareSlug": None,
        "scope": "owner",
        "featured": {"enabled": False, "rank": None},
        "definition": {
            "rootStepId": "step-root",
            "stepsById": {
                "step-root": {
                    "id": "step-root",
                    "parentId": None,
                    "childIds": [],
                    "relationship": None,
                    "resolvedModelId": "auth.User",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": None,
                    "filter": None,
                },
            },
        },
        "layoutSettings": {},
    }
    payload.update(overrides)
    return payload


class ResourceRevisionTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="resource-owner",
            email="resource-owner@example.com",
        )
        self.client.force_authenticate(self.user)

    def test_drawing_create_accepts_client_supplied_id_and_returns_etag(self):
        drawing_id = uuid.uuid4()

        response = self.client.post(
            "/schema-viz/drawings/",
            build_drawing_payload(id=str(drawing_id)),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["id"], str(drawing_id))
        self.assertEqual(response.json()["revision"], 1)
        self.assertEqual(response.headers.get("ETag"), '"1"')

    def test_drawing_patch_with_stale_if_match_returns_current_entity(self):
        drawing = Drawing.objects.create(
            title="Original title",
            description="",
            react_flow_state=build_drawing_payload()["reactFlowState"],
            lexical_state=build_drawing_payload()["lexicalState"],
            owner=self.user,
        )
        drawing.title = "Updated on server"
        drawing.save()

        response = self.client.patch(
            f"/schema-viz/drawings/{drawing.id}/",
            {"title": "Stale local update"},
            format="json",
            HTTP_IF_MATCH='"1"',
        )

        self.assertEqual(response.status_code, 412)
        self.assertEqual(response.json()["current"]["title"], "Updated on server")
        self.assertEqual(response.json()["current"]["revision"], 2)
        self.assertEqual(response.headers.get("ETag"), '"2"')

    def test_style_template_create_accepts_client_supplied_id(self):
        template_id = uuid.uuid4()

        response = self.client.post(
            "/schema-viz/templates/",
            build_style_payload(id=str(template_id), name="Client Supplied Style"),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["id"], str(template_id))
        self.assertEqual(response.json()["revision"], 1)
        self.assertEqual(response.headers.get("ETag"), '"1"')

    def test_generation_template_update_with_if_match_increments_revision(self):
        template = GenerationTemplate.objects.create(
            name="Template",
            owner=self.user,
            is_global=False,
            root_model="auth.User",
            export_name="template",
            steps={"visible": True, "children": []},
        )

        response = self.client.put(
            f"/schema-viz/generation-templates/{template.id}/",
            build_generation_payload(
                name="Template v2",
                shareSlug="template",
            ),
            format="json",
            HTTP_IF_MATCH='"1"',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revision"], 2)
        self.assertEqual(response.headers.get("ETag"), '"2"')

    def test_generation_template_delete_with_stale_if_match_returns_conflict(self):
        template = GenerationTemplate.objects.create(
            name="Delete me",
            owner=self.user,
            is_global=False,
            root_model="auth.User",
            export_name="delete-me",
            steps={"visible": True, "children": []},
        )
        template.description = "Server changed"
        template.save()

        response = self.client.delete(
            f"/schema-viz/generation-templates/{template.id}/",
            HTTP_IF_MATCH='"1"',
        )

        self.assertEqual(response.status_code, 412)
        self.assertEqual(response.json()["current"]["revision"], 2)
        self.assertTrue(
            GenerationTemplate.objects.filter(id=template.id, owner=self.user).exists()
        )
