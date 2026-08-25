from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()

VALIDATE_URL = "/schema-viz/generation-runs/validate/"


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


class GenerationValidateViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="validator", password="validator-pass"
        )
        self.client.force_authenticate(user=self.user)

    def post(self, payload):
        return self.client.post(VALIDATE_URL, payload, format="json")

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.post(
            {
                "rootModel": "infrastructure.CloudProvider",
                "inlineDefinition": build_definition(),
            }
        )

        self.assertIn(response.status_code, (401, 403))

    def test_valid_definition_reports_no_errors(self):
        response = self.post(
            {
                "rootModel": "infrastructure.CloudProvider",
                "inlineDefinition": build_definition(),
            }
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["valid"])
        self.assertEqual(payload["errors"], [])
        self.assertEqual(payload["warnings"], [])

    def test_unknown_relationship_reports_error_without_http_400(self):
        definition = build_definition()
        definition["stepsById"]["step-regions"]["relationship"] = "not_a_relation"

        response = self.post(
            {
                "rootModel": "infrastructure.CloudProvider",
                "inlineDefinition": definition,
            }
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertTrue(payload["errors"])
        self.assertEqual(payload["errors"][0]["stepId"], "step-regions")

    def test_unknown_root_model_reports_error(self):
        response = self.post(
            {
                "rootModel": "infrastructure.DoesNotExist",
                "inlineDefinition": build_definition(),
            }
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertTrue(payload["errors"])

    def test_missing_root_step_reports_error(self):
        definition = build_definition()
        definition["rootStepId"] = "unknown-step"

        response = self.post(
            {
                "rootModel": "infrastructure.CloudProvider",
                "inlineDefinition": definition,
            }
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertTrue(payload["errors"])

    def test_malformed_request_body_is_reported_as_invalid(self):
        response = self.post({"inlineDefinition": build_definition()})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertEqual(payload["errors"][0]["code"], "invalid_request")
