from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from rest_framework.test import APITestCase

from qlab.models import ModelRegistry

from django_schema_viz.tests.qlab_registry_helpers import (
    seed_qlab_registry,
    set_registry_entry,
)

User = get_user_model()

MODEL_REGISTRY_URL = "/schema-viz/model-registry/"


class ModelRegistryAdminApiTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.staff = User.objects.create_user(
            username="staff-admin",
            email="staff-admin@example.com",
            is_staff=True,
        )
        self.user = User.objects.create_user(
            username="plain-user",
            email="plain-user@example.com",
        )
        self.analysts = Group.objects.create(name="Analysts")

    def test_list_requires_staff(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(MODEL_REGISTRY_URL)

        self.assertEqual(response.status_code, 403)

    def test_staff_can_list_registry_entries(self):
        self.client.force_authenticate(self.staff)

        response = self.client.get(MODEL_REGISTRY_URL)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            any(entry["modelRef"] == "infrastructure.cloudprovider" for entry in response.json())
        )

    def test_staff_can_patch_registry_entry(self):
        entry = set_registry_entry("infrastructure.cloudprovider", status="enabled")
        self.client.force_authenticate(self.staff)

        response = self.client.patch(
            f"{MODEL_REGISTRY_URL}{entry.pk}/",
            {
                "status": "enabled",
                "isRestricted": True,
                "allowedGroupIds": [self.analysts.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        entry.refresh_from_db()
        self.assertTrue(entry.is_restricted)
        self.assertEqual(list(entry.allowed_groups.values_list("id", flat=True)), [self.analysts.pk])

    def test_staff_can_create_registry_entry_for_missing_model(self):
        ModelRegistry.objects.filter(model_label="infrastructure_CloudProvider").delete()
        self.client.force_authenticate(self.staff)

        response = self.client.post(
            MODEL_REGISTRY_URL,
            {
                "modelRef": "infrastructure.cloudprovider",
                "status": "enabled",
                "isRestricted": True,
                "allowedGroupIds": [self.analysts.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        entry = ModelRegistry.objects.get(model_label="infrastructure_CloudProvider")
        self.assertEqual(entry.status, "enabled")
        self.assertTrue(entry.is_restricted)
        self.assertEqual(list(entry.allowed_groups.values_list("id", flat=True)), [self.analysts.pk])

    @override_settings(QLAB_SETTINGS={"ALLOWED_APPS": ["auth"]})
    def test_candidates_follow_qlab_allowed_apps(self):
        ModelRegistry.objects.all().delete()
        self.client.force_authenticate(self.staff)

        response = self.client.get(f"{MODEL_REGISTRY_URL}candidates/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(entry["modelRef"] == "auth.user" for entry in payload))
        self.assertFalse(
            any(entry["appLabel"] == "infrastructure" for entry in payload)
        )

    def test_groups_action_lists_auth_groups(self):
        self.client.force_authenticate(self.staff)

        response = self.client.get(f"{MODEL_REGISTRY_URL}groups/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            {"id": self.analysts.pk, "name": "Analysts"},
            response.json(),
        )
