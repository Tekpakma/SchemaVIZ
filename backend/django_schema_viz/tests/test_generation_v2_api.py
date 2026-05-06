from django.contrib.auth import get_user_model
from uuid import uuid4
from rest_framework.test import APITestCase

from django_schema_viz.tests.qlab_registry_helpers import (
    seed_qlab_registry,
    set_registry_entry,
)
from infrastructure.models import CloudProvider, Region

User = get_user_model()

GENERATION_TEMPLATES_URL = "/schema-viz/generation-templates/"
GENERATION_RUNS_URL = "/schema-viz/generation-runs/"
GENERATION_TEMPLATE_QUICK_ACCESS_URL = "/schema-viz/generation-template-quick-access/"
FEATURED_GENERATION_TEMPLATE_QUICK_ACCESS_URL = (
    "/schema-viz/generation-template-quick-access/featured/"
)


def build_definition():
    return {
        "rootStepId": "step-root",
        "stepsById": {
            "step-root": {
                "id": "step-root",
                "parentId": None,
                "childIds": ["step-regions"],
                "relationship": None,
                "resolvedModelId": "infrastructure.CloudProvider",
                "visibility": "visible",
                "groupMode": "none",
                "styleTemplateId": None,
                "label": "Provider",
                "filter": None,
            },
            "step-regions": {
                "id": "step-regions",
                "parentId": "step-root",
                "childIds": [],
                "relationship": "regions",
                "resolvedModelId": "infrastructure.Region",
                "visibility": "visible",
                "groupMode": "none",
                "styleTemplateId": None,
                "label": "Regions",
                "filter": None,
            },
        },
    }


def build_template_payload(**overrides):
    payload = {
        "name": "Cloud Provider Overview",
        "description": "V2 generation template",
        "rootModel": "infrastructure.CloudProvider",
        "shareSlug": "cloud-provider-overview",
        "scope": "owner",
        "featured": {
            "enabled": False,
            "rank": None,
        },
        "definition": build_definition(),
        "layoutSettings": {},
    }
    payload.update(overrides)
    return payload


class GenerationV2ApiTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
        )
        self.viewer = User.objects.create_user(
            username="viewer",
            email="viewer@example.com",
        )
        self.provider = CloudProvider.objects.create(
            name="Amazon Web Services",
            slug="aws",
        )
        self.region = Region.objects.create(
            provider=self.provider,
            name="Frankfurt",
            code="eu-central-1",
            location="Frankfurt, Germany",
        )

    def test_create_returns_draft_version_summary(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["shareSlug"], "cloud-provider-overview")
        self.assertIsNotNone(body["draftVersion"])
        self.assertEqual(body["draftVersion"]["versionNumber"], 1)
        self.assertIsNone(body["publishedVersion"])

    def test_publish_snapshots_current_draft_and_enables_published_runs(self):
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        publish_response = self.client.post(
            f"{GENERATION_TEMPLATES_URL}{template_id}/publish/",
            {},
            format="json",
        )
        self.assertEqual(publish_response.status_code, 200)
        publish_body = publish_response.json()
        self.assertEqual(publish_body["publishedVersion"]["versionNumber"], 2)
        self.assertEqual(
            publish_body["publishedVersion"]["rootModel"],
            "infrastructure.CloudProvider",
        )
        self.assertEqual(
            publish_body["publishedVersion"]["definition"]["rootStepId"], "step-root"
        )

        run_response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "live",
                "recordId": str(self.provider.pk),
                "source": {
                    "templateId": template_id,
                    "version": "published",
                },
            },
            format="json",
        )
        self.assertEqual(run_response.status_code, 200)
        run_body = run_response.json()
        self.assertEqual(run_body["mode"], "live")
        self.assertEqual(run_body["sourceVersion"]["selection"], "published")
        self.assertEqual(run_body["template"]["publishedVersion"]["versionNumber"], 2)
        self.assertEqual(len(run_body["result"]["nodes"]), 2)

    def test_unpublish_clears_published_version_and_keeps_draft(self):
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        publish_response = self.client.post(
            f"{GENERATION_TEMPLATES_URL}{template_id}/publish/",
            {},
            format="json",
        )
        self.assertEqual(publish_response.status_code, 200)
        self.assertIsNotNone(publish_response.json()["publishedVersion"])

        unpublish_response = self.client.post(
            f"{GENERATION_TEMPLATES_URL}{template_id}/unpublish/",
            {},
            format="json",
        )

        self.assertEqual(unpublish_response.status_code, 200)
        body = unpublish_response.json()
        self.assertIsNone(body["publishedVersion"])
        self.assertIsNone(body["publishedAt"])
        self.assertIsNotNone(body["draftVersion"])

    def test_draft_runs_are_limited_to_template_owner(self):
        self.owner.is_staff = True
        self.owner.save(update_fields=["is_staff"])
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(scope="global"),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        self.client.force_authenticate(self.viewer)
        run_response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "structure",
                "source": {
                    "templateId": template_id,
                    "version": "draft",
                },
            },
            format="json",
        )

        self.assertEqual(run_response.status_code, 403)

    def test_generation_template_responses_include_owned_by_current_user(self):
        self.owner.is_staff = True
        self.owner.save(update_fields=["is_staff"])
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(scope="global"),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        owner_list_response = self.client.get(GENERATION_TEMPLATES_URL)
        self.assertEqual(owner_list_response.status_code, 200)
        self.assertEqual(owner_list_response.json()[0]["ownedByCurrentUser"], True)

        owner_retrieve_response = self.client.get(
            f"{GENERATION_TEMPLATES_URL}{template_id}/"
        )
        self.assertEqual(owner_retrieve_response.status_code, 200)
        self.assertEqual(
            owner_retrieve_response.json()["ownedByCurrentUser"],
            True,
        )

        self.client.force_authenticate(self.viewer)

        viewer_list_response = self.client.get(GENERATION_TEMPLATES_URL)
        self.assertEqual(viewer_list_response.status_code, 200)
        self.assertEqual(viewer_list_response.json()[0]["ownedByCurrentUser"], False)

        viewer_retrieve_response = self.client.get(
            f"{GENERATION_TEMPLATES_URL}{template_id}/"
        )
        self.assertEqual(viewer_retrieve_response.status_code, 200)
        self.assertEqual(
            viewer_retrieve_response.json()["ownedByCurrentUser"],
            False,
        )

    def test_generate_share_route_uses_published_template(self):
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]
        publish_response = self.client.post(
            f"{GENERATION_TEMPLATES_URL}{template_id}/publish/",
            {},
            format="json",
        )
        self.assertEqual(publish_response.status_code, 200)

        self.client.force_authenticate(self.viewer)
        response = self.client.get(
            f"/schema-viz/generate/cloud-provider-overview/{self.provider.pk}/"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["mode"], "share")
        self.assertEqual(body["sourceVersion"]["selection"], "published")
        self.assertEqual(body["template"]["shareSlug"], "cloud-provider-overview")
        self.assertEqual(len(body["result"]["nodes"]), 2)

    def test_publish_makes_share_base_route_resolvable(self):
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        publish_response = self.client.post(
            f"{GENERATION_TEMPLATES_URL}{template_id}/publish/",
            {},
            format="json",
        )
        self.assertEqual(publish_response.status_code, 200)

        self.client.force_authenticate(self.viewer)
        response = self.client.get("/schema-viz/generate/cloud-provider-overview/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["shareSlug"], "cloud-provider-overview")
        self.assertIsNotNone(body["publishedVersion"])

    def test_inline_structure_run_accepts_editor_definition_shape(self):
        self.client.force_authenticate(self.owner)
        root_step_id = str(uuid4())
        child_step_id = str(uuid4())

        response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "structure",
                "source": {
                    "rootModel": "infrastructure.cloudprovider",
                    "inlineDefinition": {
                        "rootStepId": root_step_id,
                        "stepsById": {
                            root_step_id: {
                                "id": root_step_id,
                                "parentId": None,
                                "childIds": [child_step_id],
                                "relationship": None,
                                "resolvedModelId": "infrastructure.cloudprovider",
                                "visibility": "visible",
                                "groupMode": "none",
                                "styleTemplateId": None,
                                "label": None,
                                "filter": None,
                            },
                            child_step_id: {
                                "id": child_step_id,
                                "parentId": root_step_id,
                                "childIds": [],
                                "relationship": "regions",
                                "resolvedModelId": "infrastructure.region",
                                "visibility": "visible",
                                "groupMode": "none",
                                "styleTemplateId": None,
                                "label": None,
                                "filter": None,
                            },
                        },
                    },
                    "layoutSettings": {},
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["mode"], "structure")
        self.assertEqual(body["sourceVersion"]["selection"], "inline")

    def test_create_rejects_inaccessible_root_model_from_registry(self):
        self.client.force_authenticate(self.owner)
        seed_qlab_registry(["auth.Group"], clear=True)

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(rootModel="auth.User"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("rootModel", response.json())

    def test_create_rejects_inaccessible_related_models_from_registry(self):
        self.client.force_authenticate(self.owner)
        set_registry_entry("infrastructure.cloudprovider", status="enabled")
        set_registry_entry("infrastructure.region", status="disabled")

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("definition", response.json())

    def test_quick_access_compat_routes_return_v2_generation_template_payloads(self):
        self.owner.is_staff = True
        self.owner.save(update_fields=["is_staff"])
        self.client.force_authenticate(self.owner)

        featured_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(
                name="Featured Provider Template",
                shareSlug="featured-provider-template",
                scope="global",
                featured={"enabled": True, "rank": 1},
            ),
            format="json",
        )
        self.assertEqual(featured_response.status_code, 201)
        featured_template_id = featured_response.json()["id"]
        publish_response = self.client.post(
            f"{GENERATION_TEMPLATES_URL}{featured_template_id}/publish/",
            {},
            format="json",
        )
        self.assertEqual(publish_response.status_code, 200)

        own_recent_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(
                name="Owner Draft Template",
                shareSlug="owner-draft-template",
            ),
            format="json",
        )
        self.assertEqual(own_recent_response.status_code, 201)

        featured_feed_response = self.client.get(
            f"{FEATURED_GENERATION_TEMPLATE_QUICK_ACCESS_URL}?limit=6"
        )
        self.assertEqual(featured_feed_response.status_code, 200)
        featured_feed = featured_feed_response.json()
        self.assertEqual(featured_feed["count"], 1)
        featured_entry = featured_feed["results"][0]
        self.assertEqual(featured_entry["template"]["id"], featured_template_id)
        self.assertEqual(featured_entry["template"]["featured"]["enabled"], True)
        self.assertEqual(featured_entry["source"], "featured")
        self.assertEqual(featured_entry["previewStatus"], "ready")
        self.assertEqual(featured_entry["sampleRecordId"], str(self.provider.pk))

        own_recent_feed_response = self.client.get(GENERATION_TEMPLATE_QUICK_ACCESS_URL)
        self.assertEqual(own_recent_feed_response.status_code, 200)
        own_recent_feed = own_recent_feed_response.json()
        self.assertEqual(
            [entry["template"]["name"] for entry in own_recent_feed["ownRecent"]],
            ["Owner Draft Template"],
        )
        self.assertEqual(own_recent_feed["ownRecent"][0]["source"], "own")

    def test_share_mode_rejects_draft_sources(self):
        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            build_template_payload(),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "share",
                "recordId": str(self.provider.pk),
                "source": {
                    "templateId": template_id,
                    "version": "draft",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("published", response.json()["error"].lower())
