from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APITestCase

from django_schema_viz.models import StyleTemplate
from django_schema_viz.tests.qlab_registry_helpers import (
    reset_qlab_registry,
    seed_qlab_registry,
)

User = get_user_model()

LIST_URL = "/schema-viz/templates/"
COMPATIBILITY_URL = "/schema-viz/template-compatibility/"
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


class StyleTemplateTargetingTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="template-owner",
            email="owner@example.com",
        )
        self.client.force_authenticate(self.user)

    def tearDown(self):
        reset_qlab_registry()

    def test_style_template_helper_reports_missing_target_by_default(self):
        template = StyleTemplate.objects.create(
            name="Untargeted",
            owner=self.user,
        )

        self.assertIsNone(template.target_model_ref)
        self.assertEqual(template.target_model_status, "missing")
        self.assertIsNone(template.target_model_class)

    def test_style_template_helper_reports_valid_content_type_target(self):
        template = StyleTemplate.objects.create(
            name="User only",
            owner=self.user,
            is_model_exclusive=True,
            target_content_type=ContentType.objects.get_by_natural_key("auth", "user"),
        )

        self.assertEqual(template.target_model_ref, "auth.user")
        self.assertEqual(template.target_model_status, "ok")
        self.assertEqual(template.target_model_class, get_user_model())

    def test_style_template_helper_reports_stale_target(self):
        stale_content_type = ContentType.objects.create(app_label="ghost", model="phantom")
        template = StyleTemplate.objects.create(
            name="Stale target",
            owner=self.user,
            is_model_exclusive=True,
            target_content_type=stale_content_type,
        )

        self.assertIsNone(template.target_model_ref)
        self.assertEqual(template.target_model_status, "stale")
        self.assertIsNone(template.target_model_class)

    def test_create_rejects_missing_target_model_when_exclusive(self):
        response = self.client.post(
            LIST_URL,
            {
                "name": "Exclusive template",
                "text_content": lexical_data_reference("username"),
                "is_model_exclusive": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("targetModel", response.json())

    def test_create_rejects_inaccessible_target_model_when_exclusive(self):
        seed_qlab_registry(["auth.Group"], clear=True)

        response = self.client.post(
            LIST_URL,
            {
                "name": "Exclusive template",
                "text_content": lexical_data_reference("username"),
                "is_model_exclusive": True,
                "target_model": "auth.user",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("targetModel", response.json())

    def test_create_rejects_incompatible_target_model_when_exclusive(self):
        response = self.client.post(
            LIST_URL,
            {
                "name": "Exclusive template",
                "text_content": lexical_data_reference("username"),
                "is_model_exclusive": True,
                "target_model": "auth.group",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("targetModel", response.json())

    def test_create_persists_valid_target_content_type_when_exclusive(self):
        response = self.client.post(
            LIST_URL,
            {
                "name": "Exclusive template",
                "text_content": lexical_data_reference("username"),
                "is_model_exclusive": True,
                "target_model": "auth.user",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["isModelExclusive"])
        self.assertEqual(response.json()["targetModel"], "auth.user")
        self.assertEqual(response.json()["targetModelStatus"], "ok")

        template = StyleTemplate.objects.get(name="Exclusive template")
        self.assertTrue(template.is_model_exclusive)
        self.assertEqual(template.target_content_type, ContentType.objects.get_by_natural_key("auth", "user"))

    def test_list_filter_hides_exclusive_template_for_other_models(self):
        StyleTemplate.objects.create(
            name="User only",
            owner=self.user,
            is_model_exclusive=True,
            target_content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            text_content=lexical_data_reference("username"),
        )

        response = self.client.get(
            LIST_URL,
            {"app_label": "auth", "model_name": "group"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_list_filter_shows_exclusive_template_for_matching_model(self):
        template = StyleTemplate.objects.create(
            name="User only",
            owner=self.user,
            is_model_exclusive=True,
            target_content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            text_content=lexical_data_reference("username"),
        )

        response = self.client.get(
            LIST_URL,
            {"app_label": "auth", "model_name": "user"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()], [str(template.id)])

    def test_list_filter_hides_stale_exclusive_template(self):
        stale_content_type = ContentType.objects.create(app_label="ghost", model="phantom")
        StyleTemplate.objects.create(
            name="Stale target",
            owner=self.user,
            is_model_exclusive=True,
            target_content_type=stale_content_type,
            text_content=lexical_data_reference("username"),
        )

        response = self.client.get(
            LIST_URL,
            {"app_label": "auth", "model_name": "user"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_preflight_reports_compatible_models_and_ok_forced_model(self):
        response = self.client.post(
            COMPATIBILITY_URL,
            {
                "required_fields": ["groups.name"],
                "target_model": "auth.user",
                "is_model_exclusive": True,
            },
            format="json",
        )

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["forcedModelStatus"], "ok")
        self.assertEqual(payload["forcedModel"]["appLabel"], "auth")
        self.assertEqual(payload["forcedModel"]["modelName"], "user")
        self.assertGreaterEqual(payload["compatibleModelCount"], 1)

    def test_preflight_reports_incompatible_forced_model(self):
        response = self.client.post(
            COMPATIBILITY_URL,
            {
                "required_fields": ["groups.does_not_exist"],
                "target_model": "auth.user",
                "is_model_exclusive": True,
            },
            format="json",
        )

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["compatibleModelCount"], 0)
        self.assertEqual(payload["forcedModelStatus"], "incompatible")

    def test_preflight_reports_inaccessible_forced_model(self):
        seed_qlab_registry(["auth.Group"], clear=True)

        response = self.client.post(
            COMPATIBILITY_URL,
            {
                "required_fields": ["username"],
                "target_model": "auth.user",
                "is_model_exclusive": True,
            },
            format="json",
        )

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["forcedModelStatus"], "inaccessible")

    def test_preflight_reports_stale_forced_model(self):
        response = self.client.post(
            COMPATIBILITY_URL,
            {
                "required_fields": ["username"],
                "target_model": "ghost.phantom",
                "is_model_exclusive": True,
            },
            format="json",
        )

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["forcedModelStatus"], "stale")

    def test_preflight_allows_anonymous_introspection_access(self):
        self.client.force_authenticate(user=None)

        response = self.client.post(
            COMPATIBILITY_URL,
            {
                "required_fields": ["username"],
                "is_model_exclusive": False,
            },
            format="json",
        )

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(payload["compatibleModelCount"], 1)
