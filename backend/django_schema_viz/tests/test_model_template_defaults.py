from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APITestCase

from django_schema_viz.models import ModelTemplateDefault, StyleTemplate
from django_schema_viz.tests.qlab_registry_helpers import (
    reset_qlab_registry,
    seed_qlab_registry,
)

User = get_user_model()

LIST_URL = "/schema-viz/model-template-defaults/"
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


class ModelTemplateDefaultTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="template-owner",
            email="owner@example.com",
        )
        self.other_user = User.objects.create_user(
            username="other-user",
            email="other@example.com",
        )
        self.client.force_authenticate(self.user)
        self.user_template = StyleTemplate.objects.create(
            name="User card",
            owner=self.user,
            text_content=lexical_data_reference("username"),
        )
        self.other_template = StyleTemplate.objects.create(
            name="Other card",
            owner=self.other_user,
            text_content=lexical_data_reference("username"),
        )

    def tearDown(self):
        reset_qlab_registry()

    def test_model_default_helper_reports_valid_model_ref_and_status(self):
        default = ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            style_template=self.user_template,
        )

        self.assertEqual(default.model_ref, "auth.user")
        self.assertEqual(default.model_status, "ok")
        self.assertEqual(default.model_class, get_user_model())

    def test_model_default_helper_reports_stale_target(self):
        stale_content_type = ContentType.objects.create(app_label="ghost", model="phantom")
        default = ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=stale_content_type,
            style_template=self.user_template,
        )

        self.assertIsNone(default.model_ref)
        self.assertEqual(default.model_status, "stale")
        self.assertIsNone(default.model_class)

    def test_manager_resolves_only_current_user_default(self):
        user_default = ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            style_template=self.user_template,
        )
        ModelTemplateDefault.objects.create(
            owner=self.other_user,
            content_type=ContentType.objects.get_by_natural_key("auth", "group"),
            style_template=self.other_template,
        )

        resolved = ModelTemplateDefault.objects.resolve_for_model_ref(self.user, "auth.user")

        self.assertEqual(resolved, user_default)
        self.assertIsNone(
            ModelTemplateDefault.objects.resolve_for_model_ref(self.user, "auth.group")
        )

    def test_create_persists_valid_model_default(self):
        response = self.client.post(
            LIST_URL,
            {
                "modelRef": "auth.user",
                "styleTemplateId": str(self.user_template.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["modelRef"], "auth.user")
        self.assertEqual(payload["modelStatus"], "ok")
        self.assertEqual(payload["styleTemplateId"], str(self.user_template.id))
        self.assertEqual(payload["styleTemplate"]["id"], str(self.user_template.id))

        default = ModelTemplateDefault.objects.get(owner=self.user)
        self.assertEqual(default.content_type, ContentType.objects.get_by_natural_key("auth", "user"))
        self.assertEqual(default.style_template, self.user_template)

    def test_create_rejects_inaccessible_model_ref(self):
        seed_qlab_registry(["auth.Group"], clear=True)

        response = self.client.post(
            LIST_URL,
            {
                "modelRef": "auth.user",
                "styleTemplateId": str(self.user_template.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("modelRef", response.json())

    def test_create_rejects_incompatible_template(self):
        incompatible_template = StyleTemplate.objects.create(
            name="Incompatible card",
            owner=self.user,
            text_content=lexical_data_reference("does_not_exist"),
        )

        response = self.client.post(
            LIST_URL,
            {
                "modelRef": "auth.user",
                "styleTemplateId": str(incompatible_template.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("styleTemplateId", response.json())

    def test_create_rejects_mismatched_exclusive_template(self):
        exclusive_template = StyleTemplate.objects.create(
            name="Group only",
            owner=self.user,
            text_content=lexical_data_reference("name"),
            is_model_exclusive=True,
            target_content_type=ContentType.objects.get_by_natural_key("auth", "group"),
        )

        response = self.client.post(
            LIST_URL,
            {
                "modelRef": "auth.user",
                "styleTemplateId": str(exclusive_template.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("styleTemplateId", response.json())

    def test_create_rejects_duplicate_default_for_same_owner_and_model(self):
        ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            style_template=self.user_template,
        )
        replacement_template = StyleTemplate.objects.create(
            name="Replacement card",
            owner=self.user,
            text_content=lexical_data_reference("username"),
        )

        response = self.client.post(
            LIST_URL,
            {
                "modelRef": "auth.user",
                "styleTemplateId": str(replacement_template.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("modelRef", response.json())

    def test_list_filters_by_model_ref(self):
        user_default = ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            style_template=self.user_template,
        )
        ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "group"),
            style_template=StyleTemplate.objects.create(
                name="Group card",
                owner=self.user,
                text_content=lexical_data_reference("name"),
            ),
        )

        response = self.client.get(LIST_URL, {"modelRef": "auth.user"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()], [str(user_default.id)])

    def test_update_replaces_default_template(self):
        default = ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            style_template=self.user_template,
        )
        replacement_template = StyleTemplate.objects.create(
            name="Replacement card",
            owner=self.user,
            text_content=lexical_data_reference("username"),
        )

        response = self.client.put(
            f"{LIST_URL}{default.id}/",
            {
                "modelRef": "auth.user",
                "styleTemplateId": str(replacement_template.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        default.refresh_from_db()
        self.assertEqual(default.style_template, replacement_template)

    def test_delete_style_template_cascades_model_default(self):
        default = ModelTemplateDefault.objects.create(
            owner=self.user,
            content_type=ContentType.objects.get_by_natural_key("auth", "user"),
            style_template=self.user_template,
        )

        self.user_template.delete()

        self.assertFalse(ModelTemplateDefault.objects.filter(pk=default.pk).exists())
