"""
Serializers for Schema Introspection API
Handles request validation and response formatting
"""

import re

from django.apps import apps
from django.contrib.auth.models import Group
from rest_framework import serializers
from typing import Any

from .schema_compat import extend_schema_field
from qlab.models import ModelRegistry
from .drawing_validation import (
    validate_drawing_document,
    validate_lexical_state,
    validate_react_flow_state,
)
from .models import (
    Drawing,
    GenerationTemplate,
    GenerationTemplateVersion,
    GroupTemplate,
    ModelTemplateDefault,
    StyleTemplate,
    TourProgress,
)
from .i18n import SUPPORTED_LOCALES, translate_request
from .template_uniqueness import (
    build_template_uniqueness_errors,
    normalize_export_name,
)
from .utils.generation_types import GenerationResultSerializer
from .utils.generation_steps import (
    GenerationStepValidationError,
    validate_generation_root_model,
)
from .utils.generation_definition import (
    GROUP_MODE_BREAKOUT,
    GROUP_MODE_GROUP,
    GROUP_MODE_NONE,
    HIDDEN_STEP,
    normalize_generation_definition,
    VISIBLE_STEP,
    validate_generation_definition,
)
from .utils.qlab_access import (
    EXCLUDED_REGISTRY_APP_LABELS,
    is_model_accessible_for_user,
    is_qlab_app_allowed,
)
from .utils.style_template_compatibility import (
    StyleTemplateCompatibilityService,
    parse_model_ref,
    resolve_content_type_for_model_ref,
    resolve_model_info_from_ref,
)
from .api_choices import (
    GENERATION_PREVIEW_STATUS_CHOICES,
    GENERATION_QUICK_ACCESS_SOURCE_CHOICES,
    GENERATION_RUN_MODE_CHOICES,
    GENERATION_SOURCE_KIND_CHOICES,
    GENERATION_VERSION_SELECTION_CHOICES,
    STATELESS_EXPORT_FORMAT_CHOICES,
    STATELESS_EXPORT_MODE_CHOICES,
    TEMPLATE_KIND_CHOICES,
    TEMPLATE_SCOPE_CHOICES,
)


@extend_schema_field(serializers.CharField(allow_null=True))
class StyleTemplateTargetModelField(serializers.Field):
    default_error_messages = {
        "invalid": "targetModel must be a string model reference like app_label.model_name.",
    }

    def to_representation(self, value):
        if isinstance(value, StyleTemplate):
            return value.target_model_ref
        return None

    def get_attribute(self, instance):
        return instance

    def to_internal_value(self, data):
        if data in (None, ""):
            return None
        if not isinstance(data, str):
            self.fail("invalid")
        normalized = data.strip()
        if not normalized:
            return None
        if parse_model_ref(normalized) is None:
            self.fail("invalid")
        return normalized


@extend_schema_field(serializers.CharField())
class ModelTemplateDefaultModelField(serializers.Field):
    default_error_messages = {
        "invalid": "modelRef must be a string model reference like app_label.model_name.",
    }

    def to_representation(self, value):
        if isinstance(value, ModelTemplateDefault):
            return value.model_ref
        return None

    def get_attribute(self, instance):
        return instance

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        normalized = data.strip()
        if not normalized:
            self.fail("invalid")
        if parse_model_ref(normalized) is None:
            self.fail("invalid")
        return normalized


class StyleTemplateCompatibilityModelSerializer(serializers.Serializer):
    app_label = serializers.CharField()
    app_verbose_name = serializers.CharField()
    model_name = serializers.CharField()
    verbose_name = serializers.CharField()
    verbose_name_plural = serializers.CharField()


class StyleTemplateCompatibilityRequestSerializer(serializers.Serializer):
    required_fields = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    target_model = StyleTemplateTargetModelField(required=False, allow_null=True)
    is_model_exclusive = serializers.BooleanField(required=False, default=False)


class StyleTemplateCompatibilityResponseSerializer(serializers.Serializer):
    compatible_model_count = serializers.IntegerField(min_value=0)
    compatible_models = StyleTemplateCompatibilityModelSerializer(many=True)
    forced_model = StyleTemplateCompatibilityModelSerializer(
        allow_null=True,
        required=False,
    )
    forced_model_status = serializers.ChoiceField(
        choices=[
            ("unused", "Unused"),
            ("missing", "Missing"),
            ("ok", "OK"),
            ("incompatible", "Incompatible"),
            ("inaccessible", "Inaccessible"),
            ("stale", "Stale"),
        ]
    )


class DrawingSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Drawing
        fields = [
            "id",
            "title",
            "description",
            "react_flow_state",
            "lexical_state",
            "owner",
            "created_at",
            "updated_at",
            "revision",
        ]
        read_only_fields = ["created_at", "updated_at", "revision"]

    def validate_react_flow_state(self, value):
        validate_react_flow_state(value)
        return value

    def validate_lexical_state(self, value):
        validate_lexical_state(value)
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if "react_flow_state" not in attrs and "lexical_state" not in attrs:
            return attrs

        react_flow_state = attrs.get(
            "react_flow_state",
            self.instance.react_flow_state if self.instance is not None else None,
        )
        lexical_state = attrs.get(
            "lexical_state",
            self.instance.lexical_state if self.instance is not None else {},
        )

        if react_flow_state is not None:
            validate_drawing_document(react_flow_state, lexical_state)

        return attrs


class DrawingImportSerializer(serializers.Serializer):
    file = serializers.FileField()


class QLabRegistryGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]
        read_only_fields = fields


@extend_schema_field(serializers.CharField())
class QLabRegistryModelRefField(serializers.Field):
    default_error_messages = {
        "invalid": "modelRef must be a string model reference like app_label.model_name.",
    }

    def get_attribute(self, instance):
        return instance

    def to_representation(self, value):
        try:
            model = apps.get_model(value.app_label, value.model_name)
        except LookupError:
            return f"{value.app_label}.{value.model_name.strip().lower()}"
        return f"{model._meta.app_label}.{model._meta.model_name}"

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        normalized = data.strip()
        if parse_model_ref(normalized) is None:
            self.fail("invalid")
        return normalized


class QLabRegistryEntrySerializer(serializers.ModelSerializer):
    model_ref = QLabRegistryModelRefField(required=False)
    allowed_groups = QLabRegistryGroupSerializer(many=True, read_only=True)
    allowed_group_ids = serializers.PrimaryKeyRelatedField(
        source="allowed_groups",
        queryset=Group.objects.order_by("name"),
        many=True,
        required=False,
    )
    app_verbose_name = serializers.SerializerMethodField()
    verbose_name = serializers.SerializerMethodField()
    verbose_name_plural = serializers.SerializerMethodField()
    model_exists = serializers.SerializerMethodField()
    is_qlab_app_allowed = serializers.SerializerMethodField()

    class Meta:
        model = ModelRegistry
        fields = [
            "id",
            "model_ref",
            "model_label",
            "app_label",
            "model_name",
            "status",
            "is_restricted",
            "allowed_groups",
            "allowed_group_ids",
            "app_verbose_name",
            "verbose_name",
            "verbose_name_plural",
            "model_exists",
            "is_qlab_app_allowed",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "model_label",
            "app_label",
            "model_name",
            "app_verbose_name",
            "verbose_name",
            "verbose_name_plural",
            "model_exists",
            "is_qlab_app_allowed",
            "created_at",
            "updated_at",
        ]

    def _resolve_model(self, obj):
        try:
            return apps.get_model(obj.app_label, obj.model_name)
        except LookupError:
            return None

    def get_app_verbose_name(self, obj) -> str | None:
        model = self._resolve_model(obj)
        if model is None:
            return None
        return str(model._meta.app_config.verbose_name)

    def get_verbose_name(self, obj) -> str | None:
        model = self._resolve_model(obj)
        if model is None:
            return None
        return str(model._meta.verbose_name)

    def get_verbose_name_plural(self, obj) -> str | None:
        model = self._resolve_model(obj)
        if model is None:
            return None
        return str(model._meta.verbose_name_plural)

    def get_model_exists(self, obj) -> bool:
        return self._resolve_model(obj) is not None

    def get_is_qlab_app_allowed(self, obj) -> bool:
        return is_qlab_app_allowed(obj.app_label)

    def validate_model_ref(self, value):
        normalized = value.strip()
        parsed = parse_model_ref(normalized)
        if parsed is None:
            raise serializers.ValidationError(
                "modelRef must be a string model reference like app_label.model_name."
            )
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)

        model_ref = attrs.pop("model_ref", None)
        if model_ref is None and self.instance is None:
            raise serializers.ValidationError({"model_ref": ["modelRef is required."]})

        if model_ref is not None:
            parsed = parse_model_ref(model_ref)
            if parsed is None:
                raise serializers.ValidationError(
                    {"model_ref": ["modelRef must be a valid model reference."]}
                )
            requested_app_label, requested_model_name = parsed
            if requested_app_label in EXCLUDED_REGISTRY_APP_LABELS:
                raise serializers.ValidationError(
                    {
                        "model_ref": [
                            f"modelRef cannot target the {requested_app_label} app."
                        ]
                    }
                )
            if not is_qlab_app_allowed(requested_app_label):
                raise serializers.ValidationError(
                    {
                        "model_ref": [
                            f"App {requested_app_label} is not enabled in QLAB_SETTINGS.ALLOWED_APPS."
                        ]
                    }
                )
            try:
                model = apps.get_model(requested_app_label, requested_model_name)
            except LookupError as exc:
                raise serializers.ValidationError(
                    {
                        "model_ref": [
                            "modelRef must reference an installed Django model."
                        ]
                    }
                ) from exc

            model_label = f"{model._meta.app_label}_{model.__name__}"
            if self.instance is not None and self.instance.model_label != model_label:
                raise serializers.ValidationError(
                    {"model_ref": ["modelRef cannot be changed after creation."]}
                )
            if (
                self.instance is None
                and ModelRegistry.objects.filter(model_label=model_label).exists()
            ):
                raise serializers.ValidationError(
                    {"model_ref": ["A registry entry already exists for this model."]}
                )

            attrs["app_label"] = model._meta.app_label
            attrs["model_name"] = model.__name__
            attrs["model_label"] = model_label

        return attrs


class QLabRegistryCandidateSerializer(serializers.Serializer):
    model_ref = serializers.CharField()
    model_label = serializers.CharField()
    app_label = serializers.CharField()
    model_name = serializers.CharField()
    app_verbose_name = serializers.CharField()
    verbose_name = serializers.CharField()
    verbose_name_plural = serializers.CharField()


class StyleTemplateSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())
    target_model = StyleTemplateTargetModelField(required=False, allow_null=True)
    target_model_status = serializers.CharField(read_only=True)

    class Meta:
        model = StyleTemplate
        fields = [
            "id",
            "name",
            "description",
            "visual_styles",
            "dimensions",
            "type_specific_data",
            "text_content",
            "required_fields",
            "target_model",
            "target_model_status",
            "is_model_exclusive",
            "is_global",
            "is_featured",
            "feature_rank",
            "owner",
            "created_at",
            "updated_at",
            "revision",
        ]
        read_only_fields = ["created_at", "updated_at", "revision"]

    def validate_is_global(self, value):
        request = self.context["request"]
        if value and not request.user.is_staff:
            raise serializers.ValidationError(
                translate_request(request, "errors.only_staff_global_templates")
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context["request"]
        instance = self.instance
        owner = attrs.get(
            "owner",
            instance.owner if instance is not None else request.user,
        )
        is_global = attrs.get(
            "is_global",
            instance.is_global if instance is not None else False,
        )
        is_featured = attrs.get(
            "is_featured",
            instance.is_featured if instance is not None else False,
        )
        feature_rank = attrs.get(
            "feature_rank",
            instance.feature_rank if instance is not None else None,
        )
        if (
            is_featured != (instance.is_featured if instance is not None else False)
            and not request.user.is_staff
        ):
            raise serializers.ValidationError(
                {
                    "is_featured": [
                        translate_request(
                            request, "errors.only_staff_featured_templates"
                        )
                    ]
                }
            )
        if (
            feature_rank != (instance.feature_rank if instance is not None else None)
            and not request.user.is_staff
        ):
            raise serializers.ValidationError(
                {
                    "feature_rank": [
                        translate_request(
                            request, "errors.only_staff_featured_templates"
                        )
                    ]
                }
            )
        if is_featured and not is_global:
            raise serializers.ValidationError(
                {
                    "is_featured": [
                        translate_request(request, "errors.featured_requires_global")
                    ]
                }
            )
        if feature_rank is not None and not is_featured:
            raise serializers.ValidationError(
                {
                    "feature_rank": [
                        translate_request(
                            request, "errors.featured_rank_requires_featured"
                        )
                    ]
                }
            )
        name = attrs.get("name", instance.name if instance is not None else "")
        errors = build_template_uniqueness_errors(
            template_kind="style",
            name=name,
            owner=owner,
            is_global=is_global,
            locale=getattr(request, "schema_viz_locale", None),
            template_id=str(instance.pk) if instance is not None else None,
        )
        if errors:
            raise serializers.ValidationError(errors)

        text_content = attrs.get(
            "text_content",
            instance.text_content if instance is not None else None,
        )
        required_fields = attrs.get("required_fields")
        if "text_content" in attrs or (required_fields is None and instance is None):
            required_fields = StyleTemplate(
                text_content=text_content
            )._parse_required_fields()
        elif required_fields is None:
            required_fields = instance.required_fields if instance is not None else []

        is_model_exclusive = attrs.get(
            "is_model_exclusive",
            instance.is_model_exclusive if instance is not None else False,
        )
        target_model = attrs.pop(
            "target_model",
            instance.target_model_ref if instance is not None else None,
        )

        if is_model_exclusive:
            if not target_model:
                raise serializers.ValidationError(
                    {
                        "target_model": [
                            "targetModel is required when exclusive mode is enabled."
                        ]
                    }
                )

            parsed_target = parse_model_ref(target_model)
            if parsed_target is None:
                raise serializers.ValidationError(
                    {"target_model": ["targetModel must be a valid model reference."]}
                )
            target_app_label, target_model_name = parsed_target
            user = request.user

            if not is_model_accessible_for_user(
                user, target_app_label, target_model_name
            ):
                raise serializers.ValidationError(
                    {
                        "target_model": [
                            "targetModel must reference an accessible model."
                        ]
                    }
                )

            target_model_info = resolve_model_info_from_ref(target_model, user=user)
            if target_model_info is None:
                raise serializers.ValidationError(
                    {"target_model": ["targetModel could not be resolved."]}
                )

            if not StyleTemplateCompatibilityService.are_required_fields_compatible(
                root_model=target_model_info,
                required_fields=required_fields,
                user=user,
                model_info_cache={
                    f"{target_app_label}.{target_model_name}": target_model_info,
                },
            ):
                raise serializers.ValidationError(
                    {
                        "target_model": [
                            "targetModel is incompatible with the template's required fields."
                        ]
                    }
                )

            target_content_type = resolve_content_type_for_model_ref(target_model)
            if target_content_type is None:
                raise serializers.ValidationError(
                    {
                        "target_model": [
                            "targetModel could not be resolved to a ContentType."
                        ]
                    }
                )
        else:
            target_content_type = None

        attrs["required_fields"] = required_fields
        attrs["target_content_type"] = target_content_type
        attrs["is_model_exclusive"] = is_model_exclusive
        return attrs


class StyleTemplateRequestsSerializer(serializers.Serializer):
    app_label = serializers.CharField(required=False, max_length=100)
    model_name = serializers.CharField(required=False, max_length=100)

    def validate(self, data):
        if (data.get("app_label") and not data.get("model_name")) or (
            data.get("model_name") and not data.get("app_label")
        ):
            raise serializers.ValidationError(
                "Both app_label and model_name must be provided together."
            )
        return data


class GroupTemplateSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = GroupTemplate
        fields = [
            "id",
            "name",
            "description",
            "background_color",
            "background_opacity",
            "border_color",
            "border_width",
            "border_style",
            "border_radius",
            "padding_top",
            "padding_x",
            "padding_bottom",
            "label_font_size",
            "label_color",
            "text_content",
            "child_columns",
            "child_gap_x",
            "child_gap_y",
            "child_direction",
            "is_global",
            "is_featured",
            "feature_rank",
            "owner",
            "created_at",
            "updated_at",
            "revision",
        ]
        read_only_fields = ["created_at", "updated_at", "revision"]

    def validate_is_global(self, value):
        request = self.context["request"]
        if value and not request.user.is_staff:
            raise serializers.ValidationError(
                translate_request(request, "errors.only_staff_global_templates")
            )
        return value

    def validate_is_featured(self, value):
        request = self.context["request"]
        if value and not request.user.is_staff:
            raise serializers.ValidationError(
                translate_request(request, "errors.only_staff_featured_templates")
            )
        return value

    def validate_child_direction(self, value):
        allowed = ("grid", "horizontal", "vertical")
        if value not in allowed:
            raise serializers.ValidationError(
                f"child_direction must be one of: {', '.join(allowed)}"
            )
        return value

    def validate(self, attrs):
        is_global = attrs.get("is_global", getattr(self.instance, "is_global", False))
        is_featured = attrs.get(
            "is_featured", getattr(self.instance, "is_featured", False)
        )
        if is_featured and not is_global:
            raise serializers.ValidationError(
                {"is_featured": "Featured templates must be global."}
            )
        return attrs


class ModelTemplateDefaultRequestsSerializer(serializers.Serializer):
    modelRef = serializers.CharField(required=False)

    def validate_modelRef(self, value):
        normalized = value.strip()
        if not normalized or parse_model_ref(normalized) is None:
            raise serializers.ValidationError(
                "modelRef must be a string model reference like app_label.model_name."
            )
        return normalized


class ModelTemplateDefaultSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())
    model_ref = ModelTemplateDefaultModelField()
    model_status = serializers.CharField(read_only=True)
    style_template_id = serializers.PrimaryKeyRelatedField(
        source="style_template",
        queryset=StyleTemplate.objects.none(),
    )
    style_template = StyleTemplateSerializer(read_only=True)

    class Meta:
        model = ModelTemplateDefault
        fields = [
            "id",
            "model_ref",
            "model_status",
            "style_template_id",
            "style_template",
            "owner",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "model_status",
            "style_template",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields[
                "style_template_id"
            ].queryset = StyleTemplate.objects.accessible_by_user(request.user)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context["request"]
        instance = self.instance
        owner = attrs.get(
            "owner",
            instance.owner if instance is not None else request.user,
        )
        model_ref = attrs.pop(
            "model_ref",
            instance.model_ref if instance is not None else None,
        )
        style_template = attrs.get(
            "style_template",
            instance.style_template if instance is not None else None,
        )

        if not model_ref:
            raise serializers.ValidationError({"model_ref": ["modelRef is required."]})

        parsed_target = parse_model_ref(model_ref)
        if parsed_target is None:
            raise serializers.ValidationError(
                {"model_ref": ["modelRef must be a valid model reference."]}
            )
        target_app_label, target_model_name = parsed_target
        user = request.user

        if not is_model_accessible_for_user(user, target_app_label, target_model_name):
            raise serializers.ValidationError(
                {"model_ref": ["modelRef must reference an accessible model."]}
            )

        target_model_info = resolve_model_info_from_ref(model_ref, user=user)
        if target_model_info is None:
            raise serializers.ValidationError(
                {"model_ref": ["modelRef could not be resolved."]}
            )

        target_content_type = resolve_content_type_for_model_ref(model_ref)
        if target_content_type is None:
            raise serializers.ValidationError(
                {"model_ref": ["modelRef could not be resolved to a ContentType."]}
            )

        if style_template is None:
            raise serializers.ValidationError(
                {"style_template_id": ["styleTemplateId is required."]}
            )

        if style_template.is_model_exclusive:
            if (
                style_template.target_content_type_id != target_content_type.id
                or style_template.target_model_status != "ok"
            ):
                raise serializers.ValidationError(
                    {
                        "style_template_id": [
                            "Exclusive templates must target the same model as modelRef."
                        ]
                    }
                )
        elif not StyleTemplateCompatibilityService.are_required_fields_compatible(
            root_model=target_model_info,
            required_fields=style_template.required_fields or [],
            user=user,
            model_info_cache={
                f"{target_app_label}.{target_model_name}": target_model_info,
            },
        ):
            raise serializers.ValidationError(
                {
                    "style_template_id": [
                        "styleTemplateId is incompatible with the selected model."
                    ]
                }
            )

        duplicate_qs = ModelTemplateDefault.objects.for_user(owner).filter(
            content_type=target_content_type
        )
        if instance is not None:
            duplicate_qs = duplicate_qs.exclude(pk=instance.pk)
        if duplicate_qs.exists():
            raise serializers.ValidationError(
                {"model_ref": ["A default template already exists for this model."]}
            )

        attrs["content_type"] = target_content_type
        attrs["owner"] = owner
        return attrs


class IntrospectRequestSerializer(serializers.Serializer):
    """
    Validates requests to the schema introspect endpoint

    Supported operations:
    - graph: Get complete schema graph (nodes, edges, groups)
    - models: Get all accessible models (optionally filtered by app)
    - model_details: Get detailed info about a specific model
    - apps: Get all apps with accessible models
    """

    OPERATION_CHOICES = [
        ("graph", "Graph"),
        ("models", "Models"),
        ("model_details", "Model Details"),
        ("apps", "Apps"),
    ]

    operation = serializers.ChoiceField(
        choices=OPERATION_CHOICES,
        required=True,
        help_text="Type of schema operation to perform",
    )
    params = serializers.DictField(
        required=False, default=dict, help_text="Operation-specific parameters"
    )

    def validate(self, data):
        """
        Validate that required params are present for each operation
        """
        operation = data.get("operation")
        params = data.get("params", {})

        # model_details requires both app_label and model_name
        if operation == "model_details":
            if "app_label" not in params or "model_name" not in params:
                raise serializers.ValidationError(
                    {
                        "params": "model_details operation requires app_label and model_name"
                    }
                )

        return data


class ModelInfoRequestSerializer(serializers.Serializer):
    """
    Validates requests to get model information
    """

    appLabel = serializers.CharField(
        source="app_label",
        required=True,
        max_length=100,
        help_text="Django app label",
    )
    modelName = serializers.CharField(
        source="model_name",
        required=True,
        max_length=100,
        help_text="Model name",
    )


class DynamicModelSerializer(serializers.ModelSerializer):
    """Dynamically create a serializer for any model"""

    class Meta:
        model = None
        fields = "__all__"

    @classmethod
    def for_model(cls, model):
        meta = type("Meta", (), {"model": model, "fields": "__all__"})

        # Get the primary key field name
        pk_field_name = model._meta.pk.name

        attrs: dict[str, Any] = {"Meta": meta}

        # If pk is not already named 'id', add an explicit 'id' field
        if pk_field_name != "id":
            attrs["id"] = serializers.ReadOnlyField(source="pk")

        return type(f"{model.__name__}Serializer", (cls,), attrs)


class ErrorResponseSerializer(serializers.Serializer):
    error = serializers.CharField()
    details = serializers.CharField(required=False)


class QueryFilterSerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    ordering = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=200)
    offset = serializers.IntegerField(required=False, min_value=0)
    filter = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Comma-separated field:value pairs e.g. username:alice,is_staff:true",
    )

    def get_field_filters(self) -> dict:
        raw = self.validated_data.get("filter", "")
        if not raw:
            return {}
        result = {}
        for pair in raw.split(","):
            if ":" not in pair:
                continue
            field, _, value = pair.partition(":")
            result[field.strip()] = value.strip()
        return result


class QueryResponseSerializer(serializers.Serializer):
    """
    Response format for query operation
    """

    fields = serializers.DictField()
    display_name = serializers.CharField()


class GenerationTemplateFeaturedSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(default=False)
    rank = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class GenerationDefinitionStepSchemaSerializer(serializers.Serializer):
    id = serializers.CharField(required=False)
    parent_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    child_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    relationship = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    resolved_model_id = serializers.CharField(required=False, allow_blank=True)
    visibility = serializers.ChoiceField(
        choices=[VISIBLE_STEP, HIDDEN_STEP],
        required=False,
        default=VISIBLE_STEP,
    )
    group_mode = serializers.ChoiceField(
        choices=[GROUP_MODE_NONE, GROUP_MODE_GROUP, GROUP_MODE_BREAKOUT],
        required=False,
        default=GROUP_MODE_NONE,
    )
    style_template_id = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    group_template_id = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    label = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    filter = serializers.JSONField(required=False, allow_null=True)


class GenerationDefinitionSchemaSerializer(serializers.Serializer):
    root_step_id = serializers.CharField()
    steps_by_id = serializers.DictField(
        child=GenerationDefinitionStepSchemaSerializer()
    )


class GenerationLayoutSettingsSchemaSerializer(serializers.Serializer):
    layout_algorithm = serializers.ChoiceField(
        choices=["Layered", "Tree", "Force", "Radial"],
        required=False,
    )
    layout_direction = serializers.ChoiceField(
        choices=["LR", "RL", "TB", "BT"],
        required=False,
    )
    swatches = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    # Per-step in-flight style drafts. Keyed by step id; each draft mirrors the
    # frontend RecipeStyleDraft shape (most importantly ``textContent`` —
    # Lexical state). The engine walks these to discover relation paths like
    # ``{{templates.name}}`` and resolve them server-side.
    style_drafts = serializers.DictField(
        child=serializers.JSONField(),
        required=False,
        help_text=(
            "Per-step in-flight style drafts keyed by step id. Each value "
            "holds the unsaved RecipeStyleDraft (textContent, visualStyles, "
            "dimensions, …) used to render live previews before the user "
            "saves them as StyleTemplate rows."
        ),
    )


@extend_schema_field(GenerationDefinitionSchemaSerializer)
class GenerationDefinitionField(serializers.JSONField):
    pass


@extend_schema_field(GenerationLayoutSettingsSchemaSerializer)
class GenerationLayoutSettingsField(serializers.JSONField):
    pass


class GenerationTemplatePublishedBySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj) -> str:
        return str(obj)


class GenerationTemplateVersionSummarySerializer(serializers.ModelSerializer):
    version_number = serializers.IntegerField(read_only=True)
    root_model = serializers.CharField(read_only=True)
    layout_settings = GenerationLayoutSettingsField(read_only=True)
    created_by = GenerationTemplatePublishedBySerializer(
        read_only=True, allow_null=True
    )

    class Meta:
        model = GenerationTemplateVersion
        fields = [
            "id",
            "version_number",
            "root_model",
            "layout_settings",
            "created_by",
            "created_at",
        ]


class GenerationTemplateVersionDetailSerializer(
    GenerationTemplateVersionSummarySerializer
):
    definition = GenerationDefinitionField(read_only=True)

    class Meta(GenerationTemplateVersionSummarySerializer.Meta):
        fields = GenerationTemplateVersionSummarySerializer.Meta.fields + [
            "definition",
        ]


class GenerationTemplateReadSerializer(serializers.ModelSerializer):
    root_model = serializers.CharField(read_only=True)
    share_slug = serializers.CharField(
        source="export_name", read_only=True, allow_null=True
    )
    scope = serializers.SerializerMethodField()
    owned_by_current_user = serializers.SerializerMethodField()
    featured = serializers.SerializerMethodField()
    draft_version = GenerationTemplateVersionDetailSerializer(
        read_only=True, allow_null=True
    )
    published_version = GenerationTemplateVersionDetailSerializer(
        read_only=True, allow_null=True
    )
    published_by = GenerationTemplatePublishedBySerializer(
        read_only=True, allow_null=True
    )

    class Meta:
        model = GenerationTemplate
        fields = [
            "id",
            "name",
            "description",
            "root_model",
            "scope",
            "owned_by_current_user",
            "featured",
            "share_slug",
            "draft_version",
            "published_version",
            "published_at",
            "published_by",
            "created_at",
            "updated_at",
            "revision",
        ]

    @extend_schema_field(serializers.ChoiceField(choices=["owner", "global"]))
    def get_scope(self, obj):
        return "global" if obj.is_global else "owner"

    @extend_schema_field(serializers.BooleanField())
    def get_owned_by_current_user(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.owner_id == user.id)

    @extend_schema_field(GenerationTemplateFeaturedSerializer)
    def get_featured(self, obj):
        return {
            "enabled": obj.is_featured,
            "rank": obj.feature_rank,
        }


class GenerationTemplateListSerializer(serializers.ModelSerializer):
    root_model = serializers.CharField(read_only=True)
    share_slug = serializers.CharField(
        source="export_name", read_only=True, allow_null=True
    )
    scope = serializers.SerializerMethodField()
    owned_by_current_user = serializers.SerializerMethodField()
    featured = serializers.SerializerMethodField()
    draft_version = GenerationTemplateVersionDetailSerializer(
        read_only=True, allow_null=True
    )
    published_version = GenerationTemplateVersionDetailSerializer(
        read_only=True, allow_null=True
    )
    published_by = GenerationTemplatePublishedBySerializer(
        read_only=True, allow_null=True
    )

    class Meta:
        model = GenerationTemplate
        fields = [
            "id",
            "name",
            "description",
            "root_model",
            "scope",
            "owned_by_current_user",
            "featured",
            "share_slug",
            "draft_version",
            "published_version",
            "published_at",
            "published_by",
            "created_at",
            "updated_at",
            "revision",
        ]

    @extend_schema_field(serializers.ChoiceField(choices=["owner", "global"]))
    def get_scope(self, obj):
        return "global" if obj.is_global else "owner"

    @extend_schema_field(serializers.BooleanField())
    def get_owned_by_current_user(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.owner_id == user.id)

    @extend_schema_field(GenerationTemplateFeaturedSerializer)
    def get_featured(self, obj):
        return {
            "enabled": obj.is_featured,
            "rank": obj.feature_rank,
        }


class GenerationTemplateSampleSerializer(serializers.Serializer):
    record_id = serializers.CharField(required=False, allow_null=True)
    record_display_name = serializers.CharField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=GENERATION_PREVIEW_STATUS_CHOICES)
    run = serializers.DictField(required=False, allow_null=True)


class GenerationTemplateQuickAccessSourceVersionSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=GENERATION_SOURCE_KIND_CHOICES)
    selection = serializers.ChoiceField(choices=GENERATION_VERSION_SELECTION_CHOICES)
    version_id = serializers.CharField(allow_null=True)
    version_number = serializers.IntegerField(allow_null=True)
    root_model = serializers.CharField()
    layout_settings = GenerationLayoutSettingsField()
    published_at = serializers.DateTimeField(allow_null=True)
    share_slug = serializers.CharField(allow_null=True)


class GenerationTemplateQuickAccessRunSerializer(serializers.Serializer):
    mode = serializers.CharField()
    source_version = GenerationTemplateQuickAccessSourceVersionSerializer()
    result = serializers.JSONField()
    style_templates = StyleTemplateSerializer(many=True)
    group_templates = GroupTemplateSerializer(many=True)
    template = GenerationTemplateListSerializer(required=False)


class GenerationTemplateQuickAccessEntrySerializer(serializers.Serializer):
    template = GenerationTemplateListSerializer()
    source = serializers.ChoiceField(choices=GENERATION_QUICK_ACCESS_SOURCE_CHOICES)
    sample_record_id = serializers.CharField(allow_null=True)
    sample_record_display_name = serializers.CharField(allow_null=True)
    preview_status = serializers.ChoiceField(choices=GENERATION_PREVIEW_STATUS_CHOICES)
    run = GenerationTemplateQuickAccessRunSerializer(required=False, allow_null=True)
    result = serializers.JSONField(required=False, allow_null=True)
    style_templates = StyleTemplateSerializer(many=True)


class GenerationTemplateOwnRecentQuickAccessSerializer(serializers.Serializer):
    own_recent = GenerationTemplateQuickAccessEntrySerializer(many=True)


class GenerationTemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    root_model = serializers.CharField(max_length=200)
    scope = serializers.ChoiceField(
        choices=TEMPLATE_SCOPE_CHOICES,
        required=False,
        default="owner",
    )
    featured = GenerationTemplateFeaturedSerializer(required=False)
    share_slug = serializers.CharField(
        source="export_name",
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    definition = GenerationDefinitionField()
    layout_settings = GenerationLayoutSettingsField(
        required=False,
        default=dict,
    )

    def validate_root_model(self, value):
        try:
            return validate_generation_root_model(
                value, user=self.context["request"].user
            )
        except GenerationStepValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_share_slug(self, value):
        return normalize_export_name(value)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context["request"]
        instance = self.instance
        scope = attrs.get(
            "scope", "global" if getattr(instance, "is_global", False) else "owner"
        )
        featured_payload = attrs.get("featured", None)
        current_featured_enabled = getattr(instance, "is_featured", False)
        current_featured_rank = getattr(instance, "feature_rank", None)
        is_featured = (
            featured_payload["enabled"]
            if featured_payload is not None and "enabled" in featured_payload
            else current_featured_enabled
        )
        feature_rank = (
            featured_payload.get("rank")
            if featured_payload is not None
            else current_featured_rank
        )
        is_global = scope == "global"

        if is_global and not request.user.is_staff:
            raise serializers.ValidationError(
                {
                    "scope": [
                        translate_request(request, "errors.only_staff_global_templates")
                    ]
                }
            )

        if is_featured != current_featured_enabled and not request.user.is_staff:
            raise serializers.ValidationError(
                {
                    "featured": [
                        translate_request(
                            request, "errors.only_staff_featured_templates"
                        )
                    ]
                }
            )

        if feature_rank != current_featured_rank and not request.user.is_staff:
            raise serializers.ValidationError(
                {
                    "featured": [
                        translate_request(
                            request, "errors.only_staff_featured_templates"
                        )
                    ]
                }
            )

        if is_featured and not is_global:
            raise serializers.ValidationError(
                {
                    "featured": [
                        translate_request(request, "errors.featured_requires_global")
                    ]
                }
            )

        if feature_rank is not None and not is_featured:
            raise serializers.ValidationError(
                {
                    "featured": [
                        translate_request(
                            request, "errors.featured_rank_requires_featured"
                        )
                    ]
                }
            )

        owner = getattr(instance, "owner", request.user)
        name = attrs.get("name", getattr(instance, "name", ""))
        export_name = attrs.get(
            "export_name",
            getattr(instance, "export_name", None),
        )
        root_model = attrs.get("root_model", getattr(instance, "root_model", None))
        definition = attrs.get("definition", getattr(instance, "steps", {}))
        definition = normalize_generation_definition(definition, user=request.user)
        attrs["definition"] = definition

        errors = build_template_uniqueness_errors(
            template_kind="generation",
            name=name,
            owner=owner,
            is_global=is_global,
            locale=getattr(request, "schema_viz_locale", None),
            template_id=str(instance.pk) if instance is not None else None,
            export_name=export_name,
        )
        if errors:
            if "export_name" in errors:
                errors["shareSlug"] = errors.pop("export_name")
            raise serializers.ValidationError(errors)

        if root_model:
            try:
                validate_generation_definition(
                    root_model, definition, user=request.user
                )
            except GenerationStepValidationError as exc:
                raise serializers.ValidationError({"definition": [str(exc)]}) from exc

        attrs["is_global"] = is_global
        attrs["is_featured"] = is_featured
        attrs["feature_rank"] = feature_rank
        return attrs


class GenerationRunSourceSerializer(serializers.Serializer):
    template_id = serializers.UUIDField(required=False)
    version = serializers.ChoiceField(
        choices=GENERATION_VERSION_SELECTION_CHOICES,
        required=False,
    )
    inline_definition = GenerationDefinitionField(required=False)
    root_model = serializers.CharField(required=False)
    layout_settings = GenerationLayoutSettingsField(
        required=False,
        default=dict,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)

        has_template = attrs.get("template_id") is not None
        has_inline = "inline_definition" in attrs

        if has_template == has_inline:
            raise serializers.ValidationError(
                "Provide either templateId/version or inlineDefinition/rootModel."
            )

        if has_template:
            if attrs.get("version") is None:
                raise serializers.ValidationError(
                    "source.version is required with templateId."
                )
            return attrs

        root_model = attrs.get("root_model")
        if not root_model:
            raise serializers.ValidationError(
                "source.rootModel is required for inlineDefinition."
            )

        try:
            attrs["inline_definition"] = normalize_generation_definition(
                attrs["inline_definition"],
                user=self.context["request"].user,
            )
            attrs["root_model"] = validate_generation_root_model(
                root_model,
                user=self.context["request"].user,
            )
            validate_generation_definition(
                attrs["root_model"],
                attrs["inline_definition"],
                user=self.context["request"].user,
            )
        except GenerationStepValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        return attrs


class GenerationRunRequestSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=GENERATION_RUN_MODE_CHOICES)
    record_id = serializers.CharField(
        required=False,
        allow_blank=False,
        allow_null=True,
    )
    source = GenerationRunSourceSerializer()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        mode = attrs["mode"]
        record_id = attrs.get("record_id")

        if mode in {"live", "share"} and not record_id:
            raise serializers.ValidationError(
                {"record_id": ["recordId is required for live and share runs."]}
            )

        if mode == "structure" and record_id in ("", None):
            attrs["record_id"] = None

        return attrs


class GenerationRunSourceVersionSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=GENERATION_SOURCE_KIND_CHOICES)
    selection = serializers.CharField()
    version_id = serializers.CharField(allow_null=True)
    version_number = serializers.IntegerField(allow_null=True)
    root_model = serializers.CharField()
    layout_settings = GenerationLayoutSettingsField()
    published_at = serializers.DateTimeField(allow_null=True)
    share_slug = serializers.CharField(allow_null=True)


class GenerationRunResponseSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=GENERATION_RUN_MODE_CHOICES)
    result = GenerationResultSerializer()
    source_version = GenerationRunSourceVersionSerializer()
    style_templates = StyleTemplateSerializer(many=True)
    group_templates = GroupTemplateSerializer(many=True)
    template = GenerationTemplateListSerializer(required=False)


class TemplateUniquenessRequestSerializer(serializers.Serializer):
    template_kind = serializers.ChoiceField(
        choices=TEMPLATE_KIND_CHOICES,
    )
    name = serializers.CharField(max_length=200)
    export_name = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    template_id = serializers.UUIDField(
        required=False,
        allow_null=True,
    )
    is_global = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs["export_name"] = normalize_export_name(attrs.get("export_name"))
        return attrs


class TemplateFavoritesSerializer(serializers.Serializer):
    style_template_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )
    generation_template_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )


class SessionStateCapabilitiesSerializer(serializers.Serializer):
    can_manage_featured_templates = serializers.BooleanField()
    can_manage_model_registry = serializers.BooleanField()


class SessionStateSerializer(serializers.Serializer):
    capabilities = SessionStateCapabilitiesSerializer()
    locale = serializers.ChoiceField(choices=SUPPORTED_LOCALES)
    available_locales = serializers.ListField(
        child=serializers.ChoiceField(choices=SUPPORTED_LOCALES)
    )
    default_locale = serializers.ChoiceField(choices=SUPPORTED_LOCALES)
    help_hints_enabled = serializers.BooleanField()
    help_hints_dismissed = serializers.DictField(child=serializers.CharField())
    has_ai_key = serializers.BooleanField()
    ai_base_url = serializers.CharField(allow_blank=True)
    ai_model = serializers.CharField(allow_blank=True)


class SessionStateUpdateSerializer(serializers.Serializer):
    locale = serializers.ChoiceField(choices=SUPPORTED_LOCALES, required=False)
    help_hints_enabled = serializers.BooleanField(required=False)
    help_hints_dismissed = serializers.DictField(
        child=serializers.CharField(),
        required=False,
    )
    ai_api_key = serializers.CharField(required=False, allow_blank=True)
    ai_base_url = serializers.CharField(required=False, allow_blank=True)
    ai_model = serializers.CharField(required=False, allow_blank=True)


class TemplateUniquenessResponseSerializer(serializers.Serializer):
    name_unique = serializers.BooleanField()
    name_message = serializers.CharField(
        allow_null=True,
        required=False,
    )
    export_name_unique = serializers.BooleanField(
        allow_null=True,
        required=False,
    )
    export_name_message = serializers.CharField(
        allow_null=True,
        required=False,
    )


class TourProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = TourProgress
        fields = [
            "id",
            "status",
            "current_step",
            "highest_step",
            "metadata",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TourProgressResourceSerializer(serializers.Serializer):
    key = serializers.CharField(read_only=True)
    version = serializers.IntegerField(read_only=True)
    progress = TourProgressSerializer(read_only=True)


class TourProgressUpsertSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=TourProgress.STATUS_CHOICES,
        required=False,
    )
    current_step = serializers.IntegerField(min_value=0, required=False)
    highest_step = serializers.IntegerField(min_value=0, required=False)
    metadata = serializers.DictField(required=False)

    def validate(self, data):
        if not data:
            raise serializers.ValidationError("At least one field must be provided.")
        return data


class SchemaRouteRequestSerializer(serializers.Serializer):
    startModel = serializers.CharField(required=True, source="start_model")
    endModel = serializers.CharField(required=True, source="end_model")
    waypoints = serializers.CharField(required=False, default="")
    preferred = serializers.CharField(required=False, default="")
    exclude = serializers.CharField(required=False, default="")
    limit = serializers.IntegerField(
        required=False, default=5, min_value=1, max_value=20
    )
    maxDepth = serializers.IntegerField(
        required=False, default=12, min_value=1, max_value=50, source="max_depth"
    )

    def _generic_validate(self, value):
        try:
            app_label, model_name = value.split(".")
        except ValueError:
            raise serializers.ValidationError(
                'Must be in "app_label.ModelName" format, e.g. "infrastructure.Server".'
            )

        from .utils.schema_discovery import SchemaDiscoveryService

        user = self.context["request"].user
        if convert := SchemaDiscoveryService.get_model_by_id(
            user, app_label, model_name
        ):
            return convert
        raise serializers.ValidationError(f'Model "{value}" is not accessible.')

    def validate_startModel(self, value):
        """Ensure the root_model resolves to an accessible Django model."""
        return self._generic_validate(value)

    def validate_endModel(self, value):
        return self._generic_validate(value)

    def validate_waypoints(self, value):
        return [self._generic_validate(v) for v in value.split(",") if value]

    def validate_preferred(self, value):
        return [self._generic_validate(v) for v in value.split(",") if value]

    def validate_exclude(self, value):
        return [self._generic_validate(v) for v in value.split(",") if value]


class StatelessExportSerializer(serializers.Serializer):
    """Request body for stateless SVG/DrawIO export without a saved Drawing."""

    MIN_DIMENSION = 256
    MAX_DIMENSION = 8000
    MAX_PIXELS = 40_000_000

    react_flow_state = serializers.JSONField(
        help_text="Full React Flow state with nodes, edges, and viewport.",
    )
    lexical_state = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Lexical editor state keyed by node ID.",
    )
    export_format = serializers.ChoiceField(
        choices=STATELESS_EXPORT_FORMAT_CHOICES,
        default="svg",
        help_text="Export format: svg or drawio.",
    )
    mode = serializers.ChoiceField(
        choices=STATELESS_EXPORT_MODE_CHOICES,
        default="fit",
        required=False,
        help_text="SVG render mode. 'fit' fits all nodes; 'current' uses provided viewport.",
    )
    width = serializers.IntegerField(required=False, default=None, allow_null=True)
    height = serializers.IntegerField(required=False, default=None, allow_null=True)
    file_name = serializers.CharField(
        required=False,
        default="export",
        max_length=200,
        help_text="Base file name for the Content-Disposition header.",
    )
    scale_factor = serializers.FloatField(
        required=False,
        default=1.0,
        min_value=0.25,
        max_value=4.0,
        help_text="Content scale multiplier. 1.0=fit, >1 zoom in, <1 zoom out.",
    )
    background = serializers.CharField(
        required=False,
        default="#ffffff",
        max_length=20,
        help_text="SVG background color: hex (#rrggbb) or 'transparent'.",
    )

    _HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

    def validate_background(self, value):
        if value == "transparent":
            return value
        if not self._HEX_COLOR_RE.match(value):
            raise serializers.ValidationError(
                "Must be 'transparent' or a 6-digit hex color (e.g. #ffffff)."
            )
        return value.lower()

    def validate_react_flow_state(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be a JSON object.")
        if not value.get("nodes") and not value.get("edges"):
            raise serializers.ValidationError(
                "Must contain at least 'nodes' or 'edges'."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        width = attrs.get("width")
        height = attrs.get("height")

        for name, val in [("width", width), ("height", height)]:
            if val is not None and not (
                self.MIN_DIMENSION <= val <= self.MAX_DIMENSION
            ):
                raise serializers.ValidationError(
                    {
                        name: f"Must be between {self.MIN_DIMENSION} and {self.MAX_DIMENSION}."
                    }
                )

        if (
            width is not None
            and height is not None
            and (width * height) > self.MAX_PIXELS
        ):
            raise serializers.ValidationError(
                {
                    "width": (
                        f"width*height exceeds maximum export pixels ({self.MAX_PIXELS})."
                    )
                }
            )

        return attrs
