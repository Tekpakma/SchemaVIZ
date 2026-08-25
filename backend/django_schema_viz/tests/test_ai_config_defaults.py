from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from django_schema_viz.models import SchemaVizUserPreference

User = get_user_model()

SESSION_URL = "/schema-viz/session/"
AI_CONFIG_URL = "/schema-viz/session/ai-config/"


class AiConfigDefaultsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="ai-user", password="ai-pass")
        self.client.force_authenticate(user=self.user)

    def test_session_state_falls_back_to_settings_defaults(self):
        with override_settings(
            SCHEMA_VIZ={
                "AI_DEFAULT_MODEL": "gpt-4o",
                "AI_DEFAULT_BASE_URL": "https://example.test/v1",
            }
        ):
            response = self.client.get(SESSION_URL)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["aiEnabled"])
        self.assertFalse(payload["hasAiKey"])
        self.assertEqual(payload["aiModel"], "gpt-4o")
        self.assertEqual(payload["aiBaseUrl"], "https://example.test/v1")

    def test_user_preference_wins_over_settings_defaults(self):
        SchemaVizUserPreference.objects.create(
            user=self.user,
            ai_model="gpt-4o-mini",
            ai_base_url="https://user.test/v1",
        )

        with override_settings(
            SCHEMA_VIZ={
                "AI_DEFAULT_MODEL": "gpt-4o",
                "AI_DEFAULT_BASE_URL": "https://example.test/v1",
            }
        ):
            response = self.client.get(SESSION_URL)

        payload = response.json()
        self.assertEqual(payload["aiModel"], "gpt-4o-mini")
        self.assertEqual(payload["aiBaseUrl"], "https://user.test/v1")

    def test_ai_can_be_disabled_globally(self):
        with override_settings(SCHEMA_VIZ={"AI_ENABLED": False}):
            response = self.client.get(SESSION_URL)

        self.assertFalse(response.json()["aiEnabled"])

    def test_ai_config_secret_endpoint_applies_the_same_defaults(self):
        with override_settings(
            SCHEMA_VIZ={
                "AI_DEFAULT_MODEL": "gpt-4o",
                "AI_DEFAULT_BASE_URL": "https://example.test/v1",
            }
        ):
            response = self.client.get(AI_CONFIG_URL)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["model"], "gpt-4o")
        self.assertEqual(payload["baseUrl"], "https://example.test/v1")
        self.assertEqual(payload["apiKey"], "")

    def test_patched_preferences_are_reflected_in_the_response(self):
        response = self.client.patch(
            SESSION_URL,
            {"aiModel": "gpt-5", "aiApiKey": "sk-test"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["aiModel"], "gpt-5")
        self.assertTrue(payload["hasAiKey"])
        self.assertNotIn("aiApiKey", payload)
