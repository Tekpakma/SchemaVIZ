from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from infrastructure.models import CloudProvider

from django_schema_viz.models import (
    GenerationTemplate,
    GenerationTemplateVersion,
    SchemaVizUserPreference,
    StyleTemplate,
)
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()


GENERATION_TEMPLATES_URL = "/schema-viz/generation-templates/"
SESSION_URL = "/schema-viz/session/"
OWN_RECENT_QUICK_ACCESS_URL = "/schema-viz/generation-template-quick-access/"
FEATURED_QUICK_ACCESS_URL = "/schema-viz/generation-template-quick-access/featured/"


def build_generation_definition(
    root_model: str,
    *,
    style_template_id: str | None = None,
    broken: bool = False,
):
    if broken:
        return {
            "rootStepId": "missing-root",
            "stepsById": {},
        }

    return {
        "rootStepId": "step-root",
        "stepsById": {
            "step-root": {
                "id": "step-root",
                "parentId": None,
                "childIds": [],
                "relationship": None,
                "resolvedModelId": root_model,
                "visibility": "visible",
                "groupMode": "none",
                "styleTemplateId": style_template_id,
                "label": None,
                "filter": None,
            }
        },
    }


def build_generation_payload(name: str, **overrides):
    root_model = overrides.get("rootModel", "infrastructure.CloudProvider")
    payload = {
        "name": name,
        "description": "",
        "rootModel": root_model,
        "shareSlug": None,
        "scope": "owner",
        "featured": {
            "enabled": False,
            "rank": None,
        },
        "definition": build_generation_definition(root_model),
        "layoutSettings": {},
    }
    payload.update(overrides)
    return payload


class GenerationTemplateFeaturedTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
        )
        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            is_staff=True,
        )

    def test_staff_can_create_featured_generation_template(self):
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_generation_payload(
                "Featured Template",
                scope="global",
                featured={"enabled": True, "rank": 1},
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["featured"]["enabled"])
        self.assertEqual(response.json()["featured"]["rank"], 1)

    def test_create_preserves_layout_direction_setting(self):
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_generation_payload(
                "Directional Template",
                layoutSettings={
                    "layoutAlgorithm": "Layered",
                    "layoutDirection": "TB",
                },
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json()["draftVersion"]["layoutSettings"]["layoutDirection"],
            "TB",
        )

    def test_featured_template_must_be_global(self):
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_generation_payload(
                "Broken Featured Template",
                featured={"enabled": True, "rank": 1},
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("featured", response.json())


class SessionStateViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="user",
            email="user@example.com",
        )
        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            is_staff=True,
        )

    def test_initial_locale_defaults_to_english_and_creates_preference(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(
            SESSION_URL, HTTP_ACCEPT_LANGUAGE="de-DE,de;q=0.9,en;q=0.7"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "capabilities": {
                    "canManageFeaturedTemplates": False,
                    "canManageModelRegistry": False,
                },
                "locale": "en",
                "availableLocales": ["en", "de"],
                "defaultLocale": "en",
                "helpHintsEnabled": True,
                "helpHintsDismissed": {},
                "hasAiKey": False,
                "aiModel": "",
                "aiBaseUrl": "",
            },
        )
        preference = SchemaVizUserPreference.objects.get(user=self.user)
        self.assertEqual(preference.locale, "en")

    def test_patch_updates_persisted_locale(self):
        self.client.force_authenticate(self.staff)
        SchemaVizUserPreference.objects.create(user=self.staff, locale="en")

        response = self.client.patch(SESSION_URL, {"locale": "de"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["locale"], "de")
        self.assertEqual(
            response.json()["capabilities"],
            {
                "canManageFeaturedTemplates": True,
                "canManageModelRegistry": True,
            },
        )
        self.staff.schema_viz_preference.refresh_from_db()
        self.assertEqual(self.staff.schema_viz_preference.locale, "de")


class GenerationTemplateQuickAccessViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            is_staff=True,
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
        )
        self.provider = CloudProvider.objects.create(
            name="Amazon Web Services",
            slug="aws",
        )
        self.style_template = StyleTemplate.objects.create(
            name="Provider Style",
            visual_styles={"backgroundColor": "#eee"},
            dimensions={"width": 240, "height": 120},
            owner=self.owner,
        )

        self.ready_featured = self._create_template(
            name="Ready Featured",
            root_model="infrastructure.CloudProvider",
            export_name="ready-featured",
            definition=build_generation_definition(
                "infrastructure.CloudProvider",
                style_template_id=str(self.style_template.id),
            ),
            is_global=True,
            is_featured=True,
            feature_rank=3,
            published=True,
        )
        self.no_record_featured = self._create_template(
            name="No Record Featured",
            root_model="infrastructure.Region",
            export_name="no-record-featured",
            definition=build_generation_definition("infrastructure.Region"),
            is_global=True,
            is_featured=True,
            feature_rank=2,
            published=True,
        )
        self.error_featured = self._create_template(
            name="Error Featured",
            root_model="infrastructure.CloudProvider",
            export_name=None,
            definition=build_generation_definition("infrastructure.CloudProvider"),
            published_definition=build_generation_definition(
                "infrastructure.CloudProvider",
                broken=True,
            ),
            is_global=True,
            is_featured=True,
            feature_rank=1,
            published=True,
        )
        self.private_template = self._create_template(
            name="Private Template",
            root_model="infrastructure.CloudProvider",
            export_name="private-template",
            definition=build_generation_definition("infrastructure.CloudProvider"),
            is_global=False,
            is_featured=False,
            feature_rank=None,
            published=False,
        )
        self.recent_own = self._create_template(
            name="Recent Own",
            root_model="infrastructure.CloudProvider",
            export_name=None,
            definition=build_generation_definition("infrastructure.CloudProvider"),
            is_global=False,
            is_featured=False,
            feature_rank=None,
            published=False,
        )

        base_time = timezone.now()
        self._set_updated_at(self.ready_featured, base_time - timedelta(minutes=4))
        self._set_updated_at(self.no_record_featured, base_time - timedelta(minutes=3))
        self._set_updated_at(self.error_featured, base_time - timedelta(minutes=2))
        self._set_updated_at(self.private_template, base_time - timedelta(minutes=1))
        self._set_updated_at(self.recent_own, base_time)

    def _create_template(
        self,
        *,
        name: str,
        root_model: str,
        definition: dict,
        export_name: str | None,
        is_global: bool,
        is_featured: bool,
        feature_rank: int | None,
        published: bool,
        published_definition: dict | None = None,
    ) -> GenerationTemplate:
        template = GenerationTemplate.objects.create(
            name=name,
            owner=self.owner,
            is_global=is_global,
            is_featured=is_featured,
            feature_rank=feature_rank,
            root_model=root_model,
            export_name=export_name,
            steps=definition,
        )
        draft_version = GenerationTemplateVersion.objects.create(
            template=template,
            version_number=1,
            root_model=root_model,
            definition=definition,
            layout_settings={},
            created_by=self.owner,
        )
        template.draft_version = draft_version
        update_fields = ["draft_version"]

        if published:
            published_version = GenerationTemplateVersion.objects.create(
                template=template,
                version_number=2,
                root_model=root_model,
                definition=published_definition or definition,
                layout_settings={},
                created_by=self.owner,
            )
            template.published_version = published_version
            template.published_at = timezone.now()
            template.published_by = self.owner
            update_fields.extend(["published_version", "published_at", "published_by"])

        template.save(update_fields=update_fields)
        template.refresh_from_db()
        return template

    @staticmethod
    def _set_updated_at(template: GenerationTemplate, value):
        GenerationTemplate.objects.filter(pk=template.pk).update(updated_at=value)
        template.refresh_from_db()

    def test_returns_paginated_featured_entries_with_preview_statuses(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"{FEATURED_QUICK_ACCESS_URL}?limit=4")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 3)
        self.assertIsNone(body["next"])
        self.assertIsNone(body["previous"])
        self.assertEqual(
            [entry["template"]["name"] for entry in body["results"]],
            [
                "Error Featured",
                "No Record Featured",
                "Ready Featured",
            ],
        )

        ready_entry = next(
            entry
            for entry in body["results"]
            if entry["template"]["name"] == "Ready Featured"
        )
        self.assertEqual(ready_entry["source"], "featured")
        self.assertEqual(ready_entry["previewStatus"], "ready")
        self.assertEqual(ready_entry["sampleRecordId"], str(self.provider.pk))
        self.assertEqual(ready_entry["sampleRecordDisplayName"], str(self.provider))
        self.assertEqual(len(ready_entry["result"]["nodes"]), 1)
        self.assertEqual(len(ready_entry["styleTemplates"]), 1)
        self.assertTrue(ready_entry["template"]["featured"]["enabled"])

        no_record_entry = next(
            entry
            for entry in body["results"]
            if entry["template"]["name"] == "No Record Featured"
        )
        self.assertEqual(no_record_entry["previewStatus"], "no_record")
        self.assertIsNone(no_record_entry["sampleRecordId"])

        error_entry = next(
            entry
            for entry in body["results"]
            if entry["template"]["name"] == "Error Featured"
        )
        self.assertEqual(error_entry["previewStatus"], "error")
        self.assertIsNone(error_entry["result"])

    def test_featured_view_supports_limit_offset_pagination(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get(f"{FEATURED_QUICK_ACCESS_URL}?limit=2")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])
        self.assertIsNone(body["previous"])
        self.assertEqual(
            [entry["template"]["name"] for entry in body["results"]],
            ["Error Featured", "No Record Featured"],
        )

        next_response = self.client.get(f"{FEATURED_QUICK_ACCESS_URL}?limit=2&offset=2")

        self.assertEqual(next_response.status_code, 200)
        next_body = next_response.json()
        self.assertEqual(len(next_body["results"]), 1)
        self.assertIsNone(next_body["next"])
        self.assertIsNotNone(next_body["previous"])
        self.assertEqual(
            [entry["template"]["name"] for entry in next_body["results"]],
            ["Ready Featured"],
        )

    def test_returns_owned_templates_newest_first(self):
        self.client.force_authenticate(self.owner)

        response = self.client.get(OWN_RECENT_QUICK_ACCESS_URL)

        self.assertEqual(response.status_code, 200)
        own_recent_names = [
            entry["template"]["name"] for entry in response.json()["ownRecent"]
        ]
        self.assertEqual(
            own_recent_names,
            [
                "Recent Own",
                "Private Template",
                "Error Featured",
                "No Record Featured",
                "Ready Featured",
            ],
        )
        self.assertEqual(response.json()["ownRecent"][0]["source"], "own")

    def test_hides_private_templates_from_featured_feed_of_other_users(self):
        self.client.force_authenticate(self.other_user)

        response = self.client.get(f"{FEATURED_QUICK_ACCESS_URL}?limit=10")

        self.assertEqual(response.status_code, 200)
        featured_names = [
            entry["template"]["name"] for entry in response.json()["results"]
        ]
        self.assertNotIn("Private Template", featured_names)
