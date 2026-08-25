"""
Row-level record scope (``SCHEMA_VIZ["RECORD_SCOPE"]``).

The QLab model registry decides which *models* a user reaches; the record scope
decides which *rows*. These tests pin the boundary at every entry point that
reads consumer-model data: shared generation runs, query lab, and SVG export.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from django_schema_viz.models import Drawing
from django_schema_viz.record_scope import scope_queryset
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry
from django_schema_viz.tests.record_scope_helpers import (
    hide_for,
    reset_record_scope,
)
from infrastructure.models import CloudProvider, Region

User = get_user_model()

SCOPE_PATH = "django_schema_viz.tests.record_scope_helpers.scope_queryset_for_tests"
BAD_SCOPE_PATH = (
    "django_schema_viz.tests.record_scope_helpers.scope_returning_wrong_type"
)

GENERATION_TEMPLATES_URL = "/schema-viz/generation-templates/"
QUERY_RECORDS_URL = "/schema-viz/query/records/"
QUERY_RECORD_URL = "/schema-viz/query/record/"


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


class RecordScopeConfigurationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="scoped")
        CloudProvider.objects.create(name="AWS", slug="aws")

    def test_queryset_passes_through_when_scope_is_unset(self):
        queryset = CloudProvider.objects.all()

        self.assertIs(scope_queryset(queryset, self.user), queryset)

    @override_settings(SCHEMA_VIZ={"RECORD_SCOPE": BAD_SCOPE_PATH})
    def test_scope_returning_non_queryset_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            scope_queryset(CloudProvider.objects.all(), self.user)

    @override_settings(SCHEMA_VIZ={"RECORD_SCOPE": "not.a.real.module"})
    def test_unimportable_scope_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            scope_queryset(CloudProvider.objects.all(), self.user)


@override_settings(SCHEMA_VIZ={"RECORD_SCOPE": SCOPE_PATH})
class SharedGenerationRunScopeTests(APITestCase):
    def setUp(self):
        reset_record_scope()
        self.addCleanup(reset_record_scope)
        seed_qlab_registry()
        self.owner = User.objects.create_user(username="owner")
        self.tenant = User.objects.create_user(username="tenant")

        self.provider = CloudProvider.objects.create(name="AWS", slug="aws")
        self.visible_region = Region.objects.create(
            provider=self.provider,
            name="Frankfurt",
            code="eu-central-1",
            location="DE",
        )
        self.foreign_region = Region.objects.create(
            provider=self.provider,
            name="Virginia",
            code="us-east-1",
            location="US",
        )

        self.client.force_authenticate(self.owner)
        create_response = self.client.post(
            GENERATION_TEMPLATES_URL,
            {
                "name": "Cloud Provider Overview",
                "description": "",
                "rootModel": "infrastructure.CloudProvider",
                "shareSlug": "cloud-provider-overview",
                "scope": "owner",
                "featured": {"enabled": False, "rank": None},
                "definition": build_definition(),
                "layoutSettings": {},
            },
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

    def share_url(self, record_pk):
        return f"/schema-viz/generate/cloud-provider-overview/{record_pk}/"

    def test_out_of_scope_root_record_is_not_found(self):
        hide_for("tenant", "infrastructure.cloudprovider", [self.provider.pk])
        self.client.force_authenticate(self.tenant)

        response = self.client.get(self.share_url(self.provider.pk))

        self.assertEqual(response.status_code, 404)

    def test_out_of_scope_child_record_is_omitted_from_the_graph(self):
        hide_for("tenant", "infrastructure.region", [self.foreign_region.pk])
        self.client.force_authenticate(self.tenant)

        response = self.client.get(self.share_url(self.provider.pk))

        self.assertEqual(response.status_code, 200)
        record_pks = {
            node["recordPk"] for node in response.json()["result"]["nodes"]
        }
        self.assertIn(str(self.visible_region.pk), record_pks)
        self.assertNotIn(str(self.foreign_region.pk), record_pks)

    def test_in_scope_user_still_sees_the_full_graph(self):
        hide_for("someone-else", "infrastructure.region", [self.foreign_region.pk])
        self.client.force_authenticate(self.tenant)

        response = self.client.get(self.share_url(self.provider.pk))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["result"]["nodes"]), 3)


@override_settings(SCHEMA_VIZ={"RECORD_SCOPE": SCOPE_PATH})
class QueryLabScopeTests(APITestCase):
    def setUp(self):
        reset_record_scope()
        self.addCleanup(reset_record_scope)
        seed_qlab_registry()
        self.tenant = User.objects.create_user(username="tenant")
        self.visible = CloudProvider.objects.create(name="AWS", slug="aws")
        self.hidden = CloudProvider.objects.create(name="Azure", slug="azure")
        self.client.force_authenticate(self.tenant)

    def test_records_endpoint_omits_out_of_scope_rows(self):
        hide_for("tenant", "infrastructure.cloudprovider", [self.hidden.pk])

        response = self.client.post(
            QUERY_RECORDS_URL,
            {"appLabel": "infrastructure", "modelName": "CloudProvider"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        names = {row["fields"]["name"] for row in response.json()["results"]}
        self.assertEqual(names, {"AWS"})

    def test_single_record_endpoint_hides_out_of_scope_row(self):
        hide_for("tenant", "infrastructure.cloudprovider", [self.hidden.pk])

        response = self.client.post(
            QUERY_RECORD_URL,
            {
                "appLabel": "infrastructure",
                "modelName": "CloudProvider",
                "id": str(self.hidden.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_single_record_endpoint_serves_in_scope_row(self):
        hide_for("tenant", "infrastructure.cloudprovider", [self.hidden.pk])

        response = self.client.post(
            QUERY_RECORD_URL,
            {
                "appLabel": "infrastructure",
                "modelName": "CloudProvider",
                "id": str(self.visible.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["fields"]["name"], "AWS")


@override_settings(SCHEMA_VIZ={"RECORD_SCOPE": SCOPE_PATH})
class SvgExportScopeTests(APITestCase):
    def setUp(self):
        reset_record_scope()
        self.addCleanup(reset_record_scope)
        seed_qlab_registry()
        self.tenant = User.objects.create_user(username="tenant")
        self.hidden = CloudProvider.objects.create(name="Azure", slug="azure")
        self.client.force_authenticate(self.tenant)

    def build_drawing(self, record_pk):
        return Drawing.objects.create(
            title="Export",
            description="",
            react_flow_state={
                "nodes": [
                    {
                        "id": "n1",
                        "type": "discover",
                        "position": {"x": 0, "y": 0},
                        "width": 200,
                        "height": 100,
                        "data": {
                            "appLabel": "infrastructure",
                            "modelName": "cloudprovider",
                            "modelId": str(record_pk),
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
                                        "path": "name",
                                        "styles": {},
                                    }
                                ],
                            }
                        ],
                    }
                }
            },
            owner=self.tenant,
        )

    def test_export_does_not_resolve_out_of_scope_record_fields(self):
        hide_for("tenant", "infrastructure.cloudprovider", [self.hidden.pk])
        drawing = self.build_drawing(self.hidden.pk)

        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/"
            "?exportFormat=svg&width=800&height=600"
        )

        content = response.content.decode("utf-8")
        self.assertNotIn("Azure", content)
        self.assertIn("{{name}}", content)

    def test_export_resolves_in_scope_record_fields(self):
        drawing = self.build_drawing(self.hidden.pk)

        response = self.client.get(
            f"/schema-viz/drawings/{drawing.id}/export/"
            "?exportFormat=svg&width=800&height=600"
        )

        content = response.content.decode("utf-8")
        self.assertIn("Azure", content)
        self.assertNotIn("{{name}}", content)
