from rest_framework.test import APITestCase

from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry


class SchemaGraphViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()

    def test_graph_response_includes_stable_schema_hash(self):
        first_response = self.client.get("/schema-viz/graph/")
        second_response = self.client.get("/schema-viz/graph/")

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)

        first_payload = first_response.json()
        second_payload = second_response.json()

        self.assertIn("schemaHash", first_payload)
        self.assertRegex(first_payload["schemaHash"], r"^[0-9a-f]{64}$")
        self.assertEqual(first_payload["schemaHash"], second_payload["schemaHash"])
