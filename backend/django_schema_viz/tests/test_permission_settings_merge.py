from django.test import SimpleTestCase, override_settings
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated

from django_schema_viz.mixins import SchemaVizViewMixin
from django_schema_viz.permissions import IsOwner


class PermissionSettingsMergeTests(SimpleTestCase):
    @staticmethod
    def _permission_types(category_name: str):
        permissions = SchemaVizViewMixin._resolve_permission_category(category_name)
        return [type(permission) for permission in permissions]

    @override_settings(
        SCHEMA_VIZ={
            "EXTRA_OWNER_PERMISSION_CLASSES": [
                "rest_framework.permissions.IsAdminUser"
            ],
        }
    )
    def test_extra_owner_permissions_append_default_owner_permissions(self):
        self.assertEqual(
            self._permission_types("owner"),
            [IsAuthenticated, IsOwner, IsAdminUser],
        )

    @override_settings(
        SCHEMA_VIZ={
            "EXTRA_INTROSPECTION_PERMISSION_CLASSES": [
                "rest_framework.permissions.IsAuthenticated"
            ],
        }
    )
    def test_extra_introspection_permissions_append_to_empty_default(self):
        self.assertEqual(
            self._permission_types("introspection"),
            [IsAuthenticated],
        )

    @override_settings(
        SCHEMA_VIZ={
            "USER_DATA_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
            "EXTRA_USER_DATA_PERMISSION_CLASSES": [
                "rest_framework.permissions.IsAdminUser"
            ],
        }
    )
    def test_explicit_base_override_still_allows_additional_permissions(self):
        self.assertEqual(
            self._permission_types("user_data"),
            [AllowAny, IsAdminUser],
        )

    @override_settings(
        SCHEMA_VIZ={
            "EXTRA_USER_DATA_PERMISSION_CLASSES": [
                "rest_framework.permissions.IsAuthenticated"
            ],
        }
    )
    def test_duplicate_permissions_are_instantiated_once(self):
        self.assertEqual(
            self._permission_types("user_data"),
            [IsAuthenticated],
        )
