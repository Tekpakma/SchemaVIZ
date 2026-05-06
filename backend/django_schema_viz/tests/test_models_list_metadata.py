from rest_framework.test import APITestCase

from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry


class ModelsListMetadataTests(APITestCase):
    def setUp(self):
        seed_qlab_registry(["auth.User"])

    def test_models_list_includes_admin_style_names(self):
        response = self.client.get("/schema-viz/models/?excludeDjango=false")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertIsInstance(payload, list)

        auth_user = next(
            (
                item
                for item in payload
                if item.get("appLabel") == "auth" and item.get("modelName") == "user"
            ),
            None,
        )
        self.assertIsNotNone(auth_user)

        assert auth_user is not None
        self.assertIn("verboseName", auth_user)
        self.assertIn("verboseNamePlural", auth_user)
        self.assertIn("appVerboseName", auth_user)
        self.assertTrue(auth_user["verboseName"])
        self.assertTrue(auth_user["verboseNamePlural"])
        self.assertTrue(auth_user["appVerboseName"])
