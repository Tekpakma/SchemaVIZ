from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings

from qlab.models import ModelRegistry

from django_schema_viz.tests.qlab_registry_helpers import (
    reset_qlab_registry,
    seed_qlab_registry,
    set_registry_entry,
)
from django_schema_viz.utils.qlab_access import (
    assert_registry_ready,
    get_accessible_models_for_user,
    is_model_accessible_for_user,
)

User = get_user_model()


class QLabRegistryIntegrationTests(TestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="registry-user",
            email="registry@example.com",
        )

    def tearDown(self):
        reset_qlab_registry()

    def test_enabled_unrestricted_model_is_accessible(self):
        self.assertTrue(
            is_model_accessible_for_user(self.user, "infrastructure", "cloudprovider")
        )

        accessible_models = {
            f"{app.label}.{model._meta.model_name}"
            for app, model in get_accessible_models_for_user(
                self.user, app_label="infrastructure"
            )
        }
        self.assertIn("infrastructure.cloudprovider", accessible_models)

    def test_submitted_or_disabled_models_are_not_accessible(self):
        set_registry_entry("infrastructure.cloudprovider", status="submitted")
        self.assertFalse(
            is_model_accessible_for_user(self.user, "infrastructure", "cloudprovider")
        )

        set_registry_entry("infrastructure.cloudprovider", status="disabled")
        self.assertFalse(
            is_model_accessible_for_user(self.user, "infrastructure", "cloudprovider")
        )

    def test_restricted_model_requires_allowed_group(self):
        analysts = Group.objects.create(name="Analysts")
        set_registry_entry(
            "infrastructure.cloudprovider",
            status="enabled",
            is_restricted=True,
            allowed_groups=[analysts],
        )

        self.assertFalse(
            is_model_accessible_for_user(self.user, "infrastructure", "cloudprovider")
        )

        self.user.groups.add(analysts)
        self.assertTrue(
            is_model_accessible_for_user(self.user, "infrastructure", "cloudprovider")
        )

    @override_settings(QLAB_SETTINGS={"ALLOWED_APPS": ["auth"]})
    def test_disallowed_qlab_app_is_not_accessible(self):
        set_registry_entry("infrastructure.cloudprovider", status="enabled")

        self.assertFalse(
            is_model_accessible_for_user(
                self.user,
                "infrastructure",
                "cloudprovider",
            )
        )

    def test_assert_registry_ready_raises_when_table_missing(self):
        with patch(
            "django_schema_viz.utils.qlab_access.connection.introspection.table_names",
            return_value=[],
        ):
            with self.assertRaises(ImproperlyConfigured):
                assert_registry_ready()
