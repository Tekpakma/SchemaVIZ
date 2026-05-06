from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.models import StyleTemplate
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()

LIST_URL = "/schema-viz/templates/"


def lexical_data_reference(path: str) -> dict:
    return {
        "root": {
            "type": "root",
            "children": [
                {
                    "type": "paragraph",
                    "children": [{"type": "data-reference", "path": path}],
                }
            ],
        }
    }


def lexical_text(value: str) -> dict:
    return {
        "root": {
            "type": "root",
            "children": [
                {
                    "type": "paragraph",
                    "children": [{"type": "text", "text": value}],
                }
            ],
        }
    }


class StyleTemplateCompatibilityTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="template-owner",
            email="owner@example.com",
        )
        self.client.force_authenticate(self.user)

    def test_collects_relation_paths_from_raw_text_placeholders(self):
        template = StyleTemplate.objects.create(
            name="Raw placeholders",
            text_content=lexical_text("{{ groups.name }} - {{username}} - {{groups.name}}"),
            owner=self.user,
        )
        self.assertEqual(template.required_fields, ["groups.name", "username"])

    def test_model_filter_accepts_valid_relation_paths(self):
        compatible = StyleTemplate.objects.create(
            name="Compatible",
            text_content=lexical_data_reference("groups.name"),
            owner=self.user,
        )
        StyleTemplate.objects.create(
            name="Incompatible",
            text_content=lexical_data_reference("groups.does_not_exist"),
            owner=self.user,
        )

        response = self.client.get(
            LIST_URL,
            {"app_label": "auth", "model_name": "user"},
        )
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.json()}
        self.assertIn(str(compatible.id), ids)

    def test_model_filter_rejects_invalid_relation_paths(self):
        incompatible = StyleTemplate.objects.create(
            name="Invalid relation path",
            text_content=lexical_data_reference("groups.does_not_exist"),
            owner=self.user,
        )

        response = self.client.get(
            LIST_URL,
            {"app_label": "auth", "model_name": "user"},
        )
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.json()}
        self.assertNotIn(str(incompatible.id), ids)
