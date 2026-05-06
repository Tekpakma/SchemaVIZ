"""
Mixin for all django-schema-viz views.

Reads authentication and permission classes from the ``SCHEMA_VIZ``
settings dict so that consumers can override auth without forking.
"""

from .conf import get_setting, resolve_classes
from .i18n import activate_request_locale

_CATEGORY_TO_SETTING = {
    "introspection": "INTROSPECTION_PERMISSION_CLASSES",
    "user_data": "USER_DATA_PERMISSION_CLASSES",
    "owner": "OWNER_PERMISSION_CLASSES",
}

_CATEGORY_TO_EXTRA_SETTING = {
    "introspection": "EXTRA_INTROSPECTION_PERMISSION_CLASSES",
    "user_data": "EXTRA_USER_DATA_PERMISSION_CLASSES",
    "owner": "EXTRA_OWNER_PERMISSION_CLASSES",
}


class SchemaVizViewMixin:
    """
    Drop-in mixin for DRF views / viewsets.

    Subclasses set ``schema_viz_permission_category`` to one of:
      - ``"introspection"`` – public schema endpoints
      - ``"user_data"``     – authenticated read access
      - ``"owner"``         – authenticated + ownership checks
    """

    schema_viz_permission_category: str = "user_data"  # safe default

    def initial(self, request, *args, **kwargs):
        activate_request_locale(request)
        return super().initial(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------
    def get_authenticators(self):
        auth_classes = resolve_classes(get_setting("AUTHENTICATION_CLASSES"))
        if auth_classes is None:
            # None → delegate to the DRF global default.
            return super().get_authenticators()
        return [cls() for cls in auth_classes]

    # ------------------------------------------------------------------
    # Permissions
    # ------------------------------------------------------------------
    def get_permissions(self):
        return self._resolve_permission_category(
            self.schema_viz_permission_category,
        )

    @staticmethod
    def _resolve_permission_category(category_name: str):
        """Instantiate permission classes for *category_name*."""
        setting_key = _CATEGORY_TO_SETTING.get(
            category_name, "USER_DATA_PERMISSION_CLASSES"
        )
        extra_setting_key = _CATEGORY_TO_EXTRA_SETTING.get(
            category_name, "EXTRA_USER_DATA_PERMISSION_CLASSES"
        )

        base_classes = resolve_classes(get_setting(setting_key)) or []
        extra_classes = resolve_classes(get_setting(extra_setting_key)) or []

        # Keep declaration order while avoiding duplicate class instantiation.
        merged_classes = []
        seen = set()
        for permission_class in [*base_classes, *extra_classes]:
            if permission_class in seen:
                continue
            seen.add(permission_class)
            merged_classes.append(permission_class)

        return [cls() for cls in merged_classes]
