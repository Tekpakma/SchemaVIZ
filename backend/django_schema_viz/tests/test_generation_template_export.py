from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from infrastructure.models import CloudProvider, Region

from django_schema_viz.models import (
    GenerationTemplate,
    GenerationTemplateVersion,
    StyleTemplate,
)
from django_schema_viz.tests.qlab_registry_helpers import (
    seed_qlab_registry,
    set_registry_entry,
)

User = get_user_model()

GENERATION_TEMPLATES_URL = "/schema-viz/generation-templates/"


def build_definition(
    *,
    style_template_id: str | None = None,
    group_mode: str = "none",
    child_group_mode: str = "none",
):
    return {
        "rootStepId": "step-root",
        "stepsById": {
            "step-root": {
                "id": "step-root",
                "parentId": None,
                "childIds": ["step-region"],
                "relationship": None,
                "resolvedModelId": "infrastructure.CloudProvider",
                "visibility": "visible",
                "groupMode": group_mode,
                "styleTemplateId": style_template_id,
                "label": None,
                "filter": None,
            },
            "step-region": {
                "id": "step-region",
                "parentId": "step-root",
                "childIds": [],
                "relationship": "regions",
                "resolvedModelId": "infrastructure.Region",
                "visibility": "visible",
                "groupMode": child_group_mode,
                "styleTemplateId": None,
                "label": None,
                "filter": None,
            },
        },
    }


def attach_published_version(template: GenerationTemplate, definition: dict):
    version = GenerationTemplateVersion.objects.create(
        template=template,
        version_number=1,
        root_model=template.root_model,
        definition=definition,
        layout_settings={},
        created_by=template.owner,
    )
    GenerationTemplate.objects.filter(pk=template.pk).update(
        steps=definition,
        draft_version=version,
        published_version=version,
        published_at=timezone.now(),
        published_by=template.owner,
    )
    template.refresh_from_db()
    return template


class GenerationTemplateExportViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com"
        )
        self.other_user = User.objects.create_user(
            username="other", email="other@example.com"
        )
        self.provider = CloudProvider.objects.create(
            name="Amazon Web Services",
            slug="aws",
        )
        self.region = Region.objects.create(
            provider=self.provider,
            name="US East (N. Virginia)",
            code="us-east-1",
            location="Virginia, USA",
        )
        self.style_template = StyleTemplate.objects.create(
            name="Provider Style",
            visual_styles={"backgroundColor": "#eee"},
            dimensions={"width": 240, "height": 120},
            owner=self.owner,
        )
        private_definition = build_definition(
            style_template_id=str(self.style_template.id)
        )
        self.private_template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Private Template",
                description="private",
                root_model="infrastructure.CloudProvider",
                export_name="private-template",
                steps=private_definition,
                owner=self.owner,
                is_global=False,
            ),
            private_definition,
        )
        global_definition = build_definition()
        self.global_template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Global Template",
                description="global",
                root_model="infrastructure.CloudProvider",
                export_name="global-template",
                steps=global_definition,
                owner=self.owner,
                is_global=True,
            ),
            global_definition,
        )
        grouped_definition = build_definition(group_mode="group")
        self.grouped_template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Grouped Template",
                description="grouped",
                root_model="infrastructure.CloudProvider",
                export_name="grouped-template",
                steps=grouped_definition,
                owner=self.owner,
                is_global=False,
            ),
            grouped_definition,
        )
        breakout_definition = build_definition(
            group_mode="group",
            child_group_mode="breakout",
        )
        self.breakout_template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Breakout Template",
                description="breakout",
                root_model="infrastructure.CloudProvider",
                export_name="breakout-template",
                steps=breakout_definition,
                owner=self.owner,
                is_global=False,
            ),
            breakout_definition,
        )

    def share_url(self, share_slug: str):
        return f"/schema-viz/generate/{share_slug}/{self.provider.pk}/"

    def share_template_url(self, share_slug: str):
        return f"/schema-viz/generate/{share_slug}/"

    def test_requires_authentication(self):
        response = self.client.get(self.share_url("private-template"))
        self.assertEqual(response.status_code, 401)

    def test_owner_can_access_published_private_template_share(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.share_url("private-template"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["template"]["shareSlug"], "private-template")

    def test_authenticated_user_can_access_published_private_template_share_metadata(
        self,
    ):
        self.client.force_authenticate(self.other_user)
        response = self.client.get(self.share_template_url("private-template"))

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["name"], "Private Template")
        self.assertEqual(body["shareSlug"], "private-template")
        self.assertEqual(body["scope"], "owner")
        self.assertIsNotNone(body["publishedVersion"])

    def test_authenticated_user_can_access_published_private_template_share(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.get(self.share_url("private-template"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["template"]["shareSlug"], "private-template")

    def test_authenticated_user_can_access_global_template(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.get(self.share_url("global-template"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["template"]["shareSlug"], "global-template")

    def test_share_run_returns_403_with_access_code_when_root_model_is_not_accessible(
        self,
    ):
        set_registry_entry(
            "infrastructure.CloudProvider",
            is_restricted=True,
            allowed_groups=[],
        )
        self.client.force_authenticate(self.other_user)

        response = self.client.get(self.share_url("private-template"))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "GENERATION_SHARE_ACCESS_DENIED")
        self.assertIn("not accessible", response.json()["details"])

    def test_unknown_share_slug_returns_404(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.share_url("does-not-exist"))
        self.assertEqual(response.status_code, 404)

    def test_unpublished_share_metadata_returns_404(self):
        draft_template = GenerationTemplate.objects.create(
            name="Draft Only Template",
            description="draft",
            root_model="infrastructure.CloudProvider",
            export_name="draft-only-template",
            steps=build_definition(),
            owner=self.owner,
            is_global=False,
        )
        self.client.force_authenticate(self.other_user)

        response = self.client.get(self.share_template_url(draft_template.export_name))

        self.assertEqual(response.status_code, 404)

    def test_export_with_record_id_path_returns_render_ready_payload(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.share_url("private-template"))
        self.assertEqual(response.status_code, 200)
        body = response.json()

        self.assertIn("template", body)
        self.assertIn("sourceVersion", body)
        self.assertIn("result", body)
        self.assertIn("styleTemplates", body)

        self.assertEqual(body["mode"], "share")
        self.assertEqual(body["template"]["shareSlug"], "private-template")
        self.assertEqual(body["sourceVersion"]["shareSlug"], "private-template")
        self.assertEqual(len(body["result"]["nodes"]), 2)
        self.assertEqual(len(body["result"]["edges"]), 1)
        self.assertEqual(body["result"]["nodes"][0]["recordPk"], str(self.provider.pk))
        self.assertEqual(len(body["styleTemplates"]), 1)
        self.assertEqual(body["styleTemplates"][0]["id"], str(self.style_template.id))

    def test_create_rejects_duplicate_share_slug_case_insensitive(self):
        self.client.force_authenticate(self.other_user)
        payload = {
            "name": "Duplicate",
            "description": "",
            "rootModel": "infrastructure.CloudProvider",
            "shareSlug": "PRIVATE-TEMPLATE",
            "scope": "owner",
            "featured": {"enabled": False, "rank": None},
            "definition": build_definition(),
            "layoutSettings": {},
        }
        response = self.client.post(GENERATION_TEMPLATES_URL, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("shareSlug", response.json())

    def test_export_includes_group_parent_relationships(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.share_url("grouped-template"))
        self.assertEqual(response.status_code, 200)
        body = response.json()

        nodes = body["result"]["nodes"]
        provider_node = next(
            node
            for node in nodes
            if node["recordPk"] == str(self.provider.pk)
            and node["modelName"] == "cloudprovider"
        )
        region_node = next(
            node
            for node in nodes
            if node["recordPk"] == str(self.region.pk) and node["modelName"] == "region"
        )

        self.assertTrue(provider_node["isGroup"])
        self.assertIsNone(provider_node["parentId"])
        self.assertEqual(region_node["parentId"], provider_node["id"])

        self.assertEqual(len(body["result"]["edges"]), 1)
        edge = body["result"]["edges"][0]
        self.assertEqual(edge["source"], provider_node["id"])
        self.assertEqual(edge["target"], region_node["id"])

    def test_break_out_of_group_removes_parent_enclosure(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.share_url("breakout-template"))
        self.assertEqual(response.status_code, 200)
        body = response.json()

        nodes = body["result"]["nodes"]
        provider_node = next(
            node
            for node in nodes
            if node["recordPk"] == str(self.provider.pk)
            and node["modelName"] == "cloudprovider"
        )
        region_node = next(
            node
            for node in nodes
            if node["recordPk"] == str(self.region.pk) and node["modelName"] == "region"
        )

        self.assertTrue(provider_node["isGroup"])
        self.assertIsNone(provider_node["parentId"])
        self.assertIsNone(region_node["parentId"])
