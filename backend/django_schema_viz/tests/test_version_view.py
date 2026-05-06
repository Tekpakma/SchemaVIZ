from rest_framework.test import APITestCase

from django_schema_viz import __version__


class BackendVersionViewTests(APITestCase):
    def test_version_endpoint_returns_installed_backend_version(self):
        response = self.client.get("/schema-viz/version/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"version": __version__})
