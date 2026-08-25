from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

GRAPH_URL = "/schema-viz/graph/"


class SchemaGraphFilterTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.client.force_authenticate(
            get_user_model().objects.create_user(username="alice")
        )

    def test_unfiltered_request_is_unchanged(self):
        response = self.client.get(GRAPH_URL)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["nodes"])
        self.assertTrue(any(node["fields"] for node in payload["nodes"]))

    def test_apps_filter_narrows_nodes_and_groups(self):
        response = self.client.get(GRAPH_URL, {"apps": "infrastructure"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["nodes"])
        self.assertTrue(
            all(node["appLabel"] == "infrastructure" for node in payload["nodes"])
        )
        node_ids = {node["id"] for node in payload["nodes"]}
        for edge in payload["edges"]:
            self.assertIn(edge["source"], node_ids)
            self.assertIn(edge["target"], node_ids)

    def test_apps_filter_is_case_insensitive(self):
        lower = self.client.get(GRAPH_URL, {"apps": "infrastructure"}).json()
        upper = self.client.get(GRAPH_URL, {"apps": "INFRASTRUCTURE"}).json()

        self.assertEqual(
            {node["id"] for node in lower["nodes"]},
            {node["id"] for node in upper["nodes"]},
        )

    def test_models_filter_accepts_full_reference_and_bare_name(self):
        by_reference = self.client.get(
            GRAPH_URL, {"models": "infrastructure.CloudProvider"}
        ).json()
        by_name = self.client.get(GRAPH_URL, {"models": "cloudprovider"}).json()

        self.assertEqual(
            [node["id"] for node in by_reference["nodes"]],
            ["infrastructure.CloudProvider"],
        )
        self.assertEqual(
            [node["id"] for node in by_name["nodes"]],
            ["infrastructure.CloudProvider"],
        )

    def test_search_matches_model_name_substring(self):
        response = self.client.get(GRAPH_URL, {"search": "region"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["nodes"])
        self.assertTrue(
            all("region" in node["name"].lower() for node in payload["nodes"])
        )

    def test_include_fields_false_returns_digest_without_fields(self):
        full = self.client.get(GRAPH_URL)
        digest = self.client.get(GRAPH_URL, {"includeFields": "false"})

        self.assertEqual(digest.status_code, 200)
        full_payload = full.json()
        digest_payload = digest.json()

        self.assertTrue(all(node["fields"] == [] for node in digest_payload["nodes"]))
        self.assertEqual(
            [node["id"] for node in full_payload["nodes"]],
            [node["id"] for node in digest_payload["nodes"]],
        )
        self.assertEqual(len(full_payload["edges"]), len(digest_payload["edges"]))
        self.assertLess(
            len(digest.content),
            len(full.content),
        )

    def test_schema_hash_identifies_the_schema_not_the_projection(self):
        full = self.client.get(GRAPH_URL).json()
        filtered = self.client.get(GRAPH_URL, {"apps": "infrastructure"}).json()

        self.assertEqual(full["schemaHash"], filtered["schemaHash"])

    def test_unknown_app_yields_an_empty_graph(self):
        response = self.client.get(GRAPH_URL, {"apps": "does_not_exist"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["nodes"], [])
        self.assertEqual(payload["edges"], [])
        self.assertEqual(payload["groups"], [])
