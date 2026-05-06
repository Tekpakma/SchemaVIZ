from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.models import GenerationTemplate, StyleTemplate
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()


TEMPLATE_UNIQUENESS_URL = "/schema-viz/template-uniqueness/"
STYLE_TEMPLATES_URL = "/schema-viz/templates/"
GENERATION_TEMPLATES_URL = "/schema-viz/generation-templates/"


def build_style_payload(name: str, **overrides):
    payload = {
        "name": name,
        "description": "",
        "visualStyles": {"backgroundColor": "#ffffff"},
        "dimensions": {"width": 220, "height": 120},
        "textContent": None,
        "requiredFields": [],
        "isGlobal": False,
    }
    payload.update(overrides)
    return payload


def build_generation_payload(name: str, **overrides):
    payload = {
        "name": name,
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


class TemplateUniquenessViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
        )
        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            is_staff=True,
        )

        self.owner_style_template = StyleTemplate.objects.create(
            name="Server Card",
            owner=self.owner,
            is_global=False,
            visual_styles={},
            dimensions={},
            text_content=None,
        )
        self.owner_generation_template = GenerationTemplate.objects.create(
            name="Network Overview",
            owner=self.owner,
            is_global=False,
            root_model="auth.User",
            export_name="network-overview",
            steps={"visible": True, "children": []},
        )

    def test_preflight_allows_unchanged_style_name_for_same_template(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            TEMPLATE_UNIQUENESS_URL,
            {
                "templateKind": "style",
                "name": "server card",
                "templateId": str(self.owner_style_template.pk),
                "isGlobal": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["nameUnique"])

    def test_preflight_rejects_duplicate_name_in_same_owner_scope(self):
        self.client.force_authenticate(self.owner)
        StyleTemplate.objects.create(
            name="App Card",
            owner=self.owner,
            is_global=False,
            visual_styles={},
            dimensions={},
            text_content=None,
        )

        response = self.client.post(
            TEMPLATE_UNIQUENESS_URL,
            {
                "templateKind": "style",
                "name": "APP CARD",
                "isGlobal": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["nameUnique"])
        self.assertIn("node template", response.json()["nameMessage"].lower())

    def test_preflight_allows_same_name_for_different_non_global_owner(self):
        self.client.force_authenticate(self.owner)
        StyleTemplate.objects.create(
            name="Shared Name",
            owner=self.other_user,
            is_global=False,
            visual_styles={},
            dimensions={},
            text_content=None,
        )

        response = self.client.post(
            TEMPLATE_UNIQUENESS_URL,
            {
                "templateKind": "style",
                "name": "shared name",
                "isGlobal": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["nameUnique"])

    def test_preflight_rejects_conflicting_generation_export_name(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            TEMPLATE_UNIQUENESS_URL,
            {
                "templateKind": "generation",
                "name": "Different Name",
                "exportName": "NETWORK-OVERVIEW",
                "isGlobal": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["nameUnique"])
        self.assertFalse(response.json()["exportNameUnique"])
        self.assertIn("already in use", response.json()["exportNameMessage"].lower())

    def test_preflight_rejects_same_export_name_for_different_owner(self):
        self.client.force_authenticate(self.other_user)

        response = self.client.post(
            TEMPLATE_UNIQUENESS_URL,
            {
                "templateKind": "generation",
                "name": "Different Name",
                "exportName": "network-overview",
                "isGlobal": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["nameUnique"])
        self.assertFalse(response.json()["exportNameUnique"])

    def test_preflight_requires_staff_for_global_scope(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            TEMPLATE_UNIQUENESS_URL,
            {
                "templateKind": "style",
                "name": "Global Name",
                "isGlobal": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class TemplateSaveValidationTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
        )
        self.client.force_authenticate(self.owner)

        self.style_template = StyleTemplate.objects.create(
            name="Server Card",
            owner=self.owner,
            is_global=False,
            visual_styles={},
            dimensions={},
            text_content=None,
        )
        self.generation_template = GenerationTemplate.objects.create(
            name="Network Overview",
            owner=self.owner,
            is_global=False,
            root_model="auth.User",
            export_name="network-overview",
            steps={"visible": True, "children": []},
        )

    def test_style_create_rejects_duplicate_name_for_same_owner(self):
        response = self.client.post(
            STYLE_TEMPLATES_URL,
            build_style_payload("server card"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json())

    def test_style_create_allows_same_name_for_different_owner(self):
        self.client.force_authenticate(self.other_user)

        response = self.client.post(
            STYLE_TEMPLATES_URL,
            build_style_payload("Server Card"),
            format="json",
        )

        self.assertEqual(response.status_code, 201)

    def test_generation_create_rejects_duplicate_name_for_same_owner(self):
        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_generation_payload("network overview"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json())

    def test_generation_create_rejects_duplicate_export_name_case_insensitive(self):
        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_generation_payload(
                "Other Template",
                shareSlug="NETWORK-OVERVIEW",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("shareSlug", response.json())

    def test_generation_create_rejects_same_export_name_for_different_owner(self):
        self.client.force_authenticate(self.other_user)

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_generation_payload(
                "Other Template",
                shareSlug="network-overview",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("shareSlug", response.json())

    def test_generation_update_allows_unchanged_name_and_export_name(self):
        response = self.client.put(
            f"{GENERATION_TEMPLATES_URL}{self.generation_template.pk}/",
            build_generation_payload(
                self.generation_template.name,
                description="updated",
                shareSlug=self.generation_template.export_name,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Network Overview")
