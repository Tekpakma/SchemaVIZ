from dataclasses import asdict
from rest_framework.views import APIView
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework import viewsets
from rest_framework import status
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework import exceptions
from rest_framework.utils.mediatypes import (
    _MediaType,
    media_type_matches,
    order_by_precedence,
)
from django.apps import apps
from django.contrib.auth.models import Group
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone

# import action
from rest_framework.decorators import action
from django.core.exceptions import FieldError
from .serializers import (
    DynamicModelSerializer,
    DrawingSerializer,
    GenerationRunRequestSerializer,
    GenerationRunResponseSerializer,
    GenerationTemplateQuickAccessEntrySerializer,
    GenerationTemplateListSerializer,
    GenerationTemplateOwnRecentQuickAccessSerializer,
    GenerationTemplateReadSerializer,
    GenerationTemplateWriteSerializer,
    GroupTemplateSerializer,
    ModelTemplateDefaultRequestsSerializer,
    ModelTemplateDefaultSerializer,
    QLabRegistryCandidateSerializer,
    QLabRegistryEntrySerializer,
    QLabRegistryGroupSerializer,
    SessionStateSerializer,
    SessionStateUpdateSerializer,
    ModelInfoRequestSerializer,
    StyleTemplateSerializer,
    TemplateFavoritesSerializer,
    QueryFilterSerializer,
    StyleTemplateRequestsSerializer,
    StyleTemplateCompatibilityRequestSerializer,
    StyleTemplateCompatibilityResponseSerializer,
    TemplateUniquenessRequestSerializer,
    TemplateUniquenessResponseSerializer,
    DrawingImportSerializer,
)
from .drf import (
    QuickAccessPagination,
    QueryPagination,
    SchemaVizCamelCaseJSONParser as CamelCaseJSONParser,
    SchemaVizCamelCaseJSONRenderer as CamelCaseJSONRenderer,
    SchemaVizCamelCaseMultiPartParser as CamelCaseMultiPartParser,
)
from rest_framework import permissions
from .mixins import SchemaVizViewMixin
from .schema_compat import (
    extend_schema,
    extend_schema_view,
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    inline_serializer,
)
from rest_framework import serializers as s
from .export import export_drawing_to_drawio, export_drawing_to_svg
from .drawing_file import parse_drawing_file_json

from .models import (
    Drawing,
    GenerationTemplateFavorite,
    GenerationTemplate,
    GenerationTemplateVersion,
    GroupTemplate,
    ModelTemplateDefault,
    SchemaVizUserPreference,
    StyleTemplateFavorite,
    StyleTemplate,
    TourDefinition,
    TourProgress,
)
from .serializers import (
    QueryResponseSerializer,
    ErrorResponseSerializer,
    SchemaRouteRequestSerializer,
    StatelessExportSerializer,
    TourProgressResourceSerializer,
    TourProgressSerializer,
    TourProgressUpsertSerializer,
)
from .utils.schema_discovery import (
    SchemaDiscoveryService,
    ModelInfoSerializer,
    ModelInfoShortSerializer,
    SchemaGraphSerializer,
    SchemaRouteSerializer,
)
from .utils.qlab_access import (
    assert_registry_ready,
    get_manageable_models,
    is_model_accessible_for_user,
)
from .utils.style_template_compatibility import (
    StyleTemplateCompatibilityService,
    resolve_content_type_for_model_ref,
)
from django.http import HttpResponse
from .utils.generation_engine import GenerationEngine, GenerationResultSerializer
from .utils.generation_steps import GenerationStepValidationError
from .template_uniqueness import (
    build_template_uniqueness_errors,
    check_template_uniqueness,
    generate_unique_template_name,
)
from .i18n import (
    DEFAULT_LOCALE,
    available_locales,
    resolve_request_locale,
    translate_request,
)
from . import __version__


def build_generation_result_response(
    request,
    generation_result,
    *,
    serialize_nested: bool = True,
):
    style_template_ids = {
        node.style_template_id
        for node in generation_result.nodes
        if node.style_template_id
    }
    style_templates = StyleTemplate.objects.filter(id__in=style_template_ids)

    group_template_ids = {
        node.group_template_id
        for node in generation_result.nodes
        if node.group_template_id
    }
    group_templates = GroupTemplate.objects.filter(id__in=group_template_ids)

    return {
        "result": GenerationResultSerializer(generation_result).data,
        "style_templates": (
            StyleTemplateSerializer(
                style_templates,
                many=True,
                context={"request": request},
            ).data
            if serialize_nested
            else list(style_templates)
        ),
        "group_templates": (
            GroupTemplateSerializer(
                group_templates,
                many=True,
                context={"request": request},
            ).data
            if serialize_nested
            else list(group_templates)
        ),
    }


def build_generation_run_response(
    request,
    *,
    mode: str,
    generation_result,
    template: GenerationTemplate | None,
    version: GenerationTemplateVersion | None,
    version_label: str,
    root_model: str,
    layout_settings: dict,
    serialize_nested: bool = True,
):
    payload = build_generation_result_response(
        request,
        generation_result,
        serialize_nested=serialize_nested,
    )
    payload["mode"] = mode
    payload["source_version"] = {
        "kind": "inline" if template is None else "template",
        "selection": version_label,
        "version_id": str(version.pk) if version is not None else None,
        "version_number": version.version_number if version is not None else None,
        "root_model": root_model,
        "layout_settings": layout_settings,
        "published_at": template.published_at if template is not None else None,
        "share_slug": template.export_name if template is not None else None,
    }
    if template is not None:
        payload["template"] = (
            GenerationTemplateListSerializer(
                template,
                context={"request": request},
            ).data
            if serialize_nested
            else template
        )
    return payload


def create_generation_template_version(
    *,
    template: GenerationTemplate,
    root_model: str,
    definition: dict,
    layout_settings: dict,
    created_by,
):
    next_version_number = (
        template.versions.order_by("-version_number")
        .values_list("version_number", flat=True)
        .first()
        or 0
    ) + 1
    return GenerationTemplateVersion.objects.create(
        template=template,
        version_number=next_version_number,
        root_model=root_model,
        definition=definition,
        layout_settings=layout_settings,
        created_by=created_by,
    )


def resolve_generation_template_sample_record(
    template: GenerationTemplate, *, user=None
):
    try:
        app_label, model_name = template.root_model.split(".", 1)
    except ValueError:
        return None

    if not is_model_accessible_for_user(user, app_label, model_name):
        return None

    try:
        model = apps.get_model(app_label, model_name)
    except LookupError:
        return None

    return model._default_manager.all().first()


def build_generation_template_sample_payload(request, template: GenerationTemplate):
    sample_record = resolve_generation_template_sample_record(
        template,
        user=request.user,
    )
    if sample_record is None:
        return {
            "record_id": None,
            "record_display_name": None,
            "status": "no_record",
        }

    version = template.published_version or template.draft_version
    if version is None:
        return {
            "record_id": str(sample_record.pk),
            "record_display_name": str(sample_record),
            "status": "error",
        }

    try:
        generation_result = GenerationEngine(
            root_model=version.root_model,
            definition=version.definition,
            user=request.user,
            layout_settings=version.layout_settings,
        ).execute(record_pk=str(sample_record.pk))
    except Exception:
        return {
            "record_id": str(sample_record.pk),
            "record_display_name": str(sample_record),
            "status": "error",
        }

    return {
        "record_id": str(sample_record.pk),
        "record_display_name": str(sample_record),
        "status": "ready",
        "run": build_generation_run_response(
            request,
            mode="live",
            generation_result=generation_result,
            template=template,
            version=version,
            version_label=(
                "published" if template.published_version_id == version.pk else "draft"
            ),
            root_model=version.root_model,
            layout_settings=version.layout_settings,
            serialize_nested=False,
        ),
    }


def build_generation_template_quick_access_entry(
    request, *, template: GenerationTemplate, source: str
):
    sample_payload = build_generation_template_sample_payload(request, template)
    run_payload = sample_payload.get("run")
    if not isinstance(run_payload, dict):
        run_payload = None

    return {
        "template": template,
        "source": source,
        "sample_record_id": sample_payload.get("record_id"),
        "sample_record_display_name": sample_payload.get("record_display_name"),
        "preview_status": sample_payload.get("status", "error"),
        "run": run_payload,
        "result": run_payload.get("result") if run_payload is not None else None,
        "style_templates": (
            run_payload.get("style_templates", []) if run_payload is not None else []
        ),
    }


def parse_generation_quick_access_int(value, default: int, *, minimum: int = 0):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= minimum else default


def build_generation_quick_access_page_url(request, *, limit: int, offset: int):
    return request.build_absolute_uri(f"{request.path}?limit={limit}&offset={offset}")


class BackendVersionView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]

    @extend_schema(
        summary="Get Backend Version",
        description="Returns the installed django-schema-viz backend version.",
        responses={
            200: inline_serializer(
                name="BackendVersionResponse",
                fields={
                    "version": s.CharField(),
                },
            ),
        },
        tags=["System"],
    )
    def get(self, request):
        return Response({"version": __version__}, status=status.HTTP_200_OK)


class GenerationTemplateOwnRecentQuickAccessView(SchemaVizViewMixin, APIView):
    renderer_classes = [CamelCaseJSONRenderer]

    def get_permissions(self):
        return self._resolve_permission_category("user_data")

    @extend_schema(
        summary="Get Own Recent Generation Template Quick Access",
        description="Returns the current user's templates ordered by most recent update for quick access.",
        responses={200: GenerationTemplateOwnRecentQuickAccessSerializer},
        tags=["Generation Templates"],
    )
    def get(self, request):
        queryset = (
            GenerationTemplate.objects.accessible_by_user(request.user)
            .filter(owner=request.user)
            .order_by("-updated_at")
        )
        payload = {
            "own_recent": [
                build_generation_template_quick_access_entry(
                    request,
                    template=template,
                    source="own",
                )
                for template in queryset
            ]
        }
        serializer = GenerationTemplateOwnRecentQuickAccessSerializer(
            payload,
            context={"request": request},
        )
        return Response(serializer.data)


class FeaturedGenerationTemplateQuickAccessView(SchemaVizViewMixin, GenericAPIView):
    renderer_classes = [CamelCaseJSONRenderer]
    pagination_class = QuickAccessPagination
    serializer_class = GenerationTemplateQuickAccessEntrySerializer

    def get_permissions(self):
        return self._resolve_permission_category("user_data")

    @extend_schema(
        summary="Get Featured Generation Template Quick Access",
        description="Returns featured published templates with preview payloads and limit-offset pagination.",
        responses={200: GenerationTemplateQuickAccessEntrySerializer(many=True)},
        tags=["Generation Templates"],
    )
    def get(self, request):
        queryset = (
            GenerationTemplate.objects.accessible_by_user(request.user)
            .filter(is_featured=True, published_version__isnull=False)
            .order_by("feature_rank", "-updated_at")
        )
        templates = self.paginate_queryset(queryset)
        entries = [
            build_generation_template_quick_access_entry(
                request,
                template=template,
                source="featured",
            )
            for template in templates
        ]
        serializer = self.get_serializer(entries, many=True)
        return self.get_paginated_response(serializer.data)


def _serialize_shape(shape):
    """Convert a ShapeDefinition dataclass to a JSON-serializable dict."""
    return {
        "key": shape.key,
        "label": shape.label,
        "default_width": shape.default_width,
        "default_height": shape.default_height,
        "category": shape.category,
        "svg_viewbox": shape.svg_viewbox,
        "svg_stroke_width": shape.svg_stroke_width,
        "svg_elements": [
            {
                "tag": el.tag,
                "attrs": dict(el.attrs),
                "fill_mode": el.fill_mode,
                "stroke_mode": el.stroke_mode,
                "stroke_dasharray": el.stroke_dasharray,
            }
            for el in shape.svg_elements
        ],
    }


class ShapesListView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]

    @extend_schema(
        summary="List Shape Definitions",
        description="Returns the shape registry with SVG rendering data for all supported shapes.",
        responses={200: None},
        tags=["System"],
    )
    def get(self, request):
        from .export.shape_registry import _SHAPES, SHAPE_ALIASES

        shapes = [_serialize_shape(s) for s in _SHAPES]
        return Response(
            {"shapes": shapes, "aliases": SHAPE_ALIASES},
            status=status.HTTP_200_OK,
        )


class AiConfigSecretView(SchemaVizViewMixin, APIView):
    """
    Internal endpoint for the TanStack Start server to retrieve the decrypted
    AI API key + config for the authenticated user. Not intended for browser use.
    """

    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]

    @extend_schema(
        summary="Get AI Config (with decrypted key)",
        description="Returns the AI configuration including the decrypted API key. Intended for server-to-server use only.",
        responses={200: None},
        tags=["System"],
    )
    def get(self, request):
        preference, _created = SchemaVizUserPreference.objects.get_or_create(
            user=request.user,
            defaults={"locale": resolve_request_locale(request)},
        )
        return Response(
            {
                "api_key": preference.ai_api_key,
                "base_url": preference.ai_base_url,
                "model": preference.ai_model,
            },
            status=status.HTTP_200_OK,
        )


class SessionCapabilitiesView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]

    @extend_schema(
        summary="Get Session State",
        description="Returns capability flags and persisted user preferences for the authenticated user.",
        responses={200: SessionStateSerializer},
        tags=["System"],
    )
    def get(self, request):
        preference, _created = SchemaVizUserPreference.objects.get_or_create(
            user=request.user,
            defaults={"locale": resolve_request_locale(request)},
        )
        serializer = SessionStateSerializer(
            {
                "capabilities": {
                    "can_manage_featured_templates": request.user.is_staff,
                    "can_manage_model_registry": request.user.is_staff,
                },
                "locale": preference.locale,
                "available_locales": list(available_locales()),
                "default_locale": DEFAULT_LOCALE,
                "help_hints_enabled": preference.help_hints_enabled,
                "help_hints_dismissed": preference.help_hints_dismissed or {},
                "has_ai_key": preference.has_ai_key,
                "ai_base_url": preference.ai_base_url,
                "ai_model": preference.ai_model,
            }
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Update Session Preferences",
        description="Updates persisted session preferences for the authenticated user.",
        request=SessionStateUpdateSerializer,
        responses={200: SessionStateSerializer},
        tags=["System"],
    )
    def patch(self, request):
        serializer = SessionStateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        preference, _created = SchemaVizUserPreference.objects.get_or_create(
            user=request.user,
            defaults={
                "locale": validated.get("locale", resolve_request_locale(request))
            },
        )
        update_fields: list[str] = []
        if "locale" in validated:
            preference.locale = validated["locale"]
            update_fields.append("locale")
        if "help_hints_enabled" in validated:
            preference.help_hints_enabled = validated["help_hints_enabled"]
            update_fields.append("help_hints_enabled")
        if "help_hints_dismissed" in validated:
            preference.help_hints_dismissed = validated["help_hints_dismissed"]
            update_fields.append("help_hints_dismissed")
        if "ai_api_key" in validated:
            preference.ai_api_key = validated["ai_api_key"]
            update_fields.append("ai_api_key_enc")
        if "ai_base_url" in validated:
            preference.ai_base_url = validated["ai_base_url"]
            update_fields.append("ai_base_url")
        if "ai_model" in validated:
            preference.ai_model = validated["ai_model"]
            update_fields.append("ai_model")
        if update_fields:
            update_fields.append("updated_at")
            preference.save(update_fields=update_fields)

        return Response(
            SessionStateSerializer(
                {
                    "capabilities": {
                        "can_manage_featured_templates": request.user.is_staff,
                        "can_manage_model_registry": request.user.is_staff,
                    },
                    "locale": preference.locale,
                    "available_locales": list(available_locales()),
                    "default_locale": DEFAULT_LOCALE,
                    "help_hints_enabled": preference.help_hints_enabled,
                    "help_hints_dismissed": preference.help_hints_dismissed or {},
                    "has_ai_key": preference.has_ai_key,
                    "ai_base_url": preference.ai_base_url,
                    "ai_model": preference.ai_model,
                }
            ).data,
            status=status.HTTP_200_OK,
        )


class RevisionedResourceViewSetMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        payload = getattr(response, "data", None)
        if isinstance(payload, dict):
            revision = payload.get("revision")
            if isinstance(revision, int):
                response["ETag"] = f'"{revision}"'
        return response

    def _parse_if_match_revision(self):
        header_value = self.request.headers.get("If-Match")
        if header_value is None:
            return None

        normalized = header_value.strip()
        if normalized.startswith("W/"):
            normalized = normalized[2:].strip()
        if normalized.startswith('"') and normalized.endswith('"'):
            normalized = normalized[1:-1]

        if not normalized.isdigit():
            raise exceptions.ValidationError(
                {"If-Match": ['Expected a quoted integer revision, e.g. "3".']}
            )

        return int(normalized)

    def _build_conflict_response(self, instance):
        serializer = self.get_serializer(instance)
        response = Response(
            {
                "error": "Resource has changed on the server.",
                "current": serializer.data,
            },
            status=status.HTTP_412_PRECONDITION_FAILED,
        )
        response["ETag"] = f'"{instance.revision}"'
        return response

    def _enforce_if_match(self):
        expected_revision = self._parse_if_match_revision()
        if expected_revision is None:
            return None

        instance = self.get_object()
        if expected_revision != instance.revision:
            return self._build_conflict_response(instance)

        return None

    def update(self, request, *args, **kwargs):
        conflict_response = self._enforce_if_match()
        if conflict_response is not None:
            return conflict_response
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        conflict_response = self._enforce_if_match()
        if conflict_response is not None:
            return conflict_response
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        conflict_response = self._enforce_if_match()
        if conflict_response is not None:
            return conflict_response
        return super().destroy(request, *args, **kwargs)


@extend_schema_view(
    list=extend_schema(
        summary="List Drawings",
        description="Returns all drawings owned by the authenticated user.",
        tags=["Drawings"],
    ),
    retrieve=extend_schema(
        summary="Get Drawing",
        description="Returns a single drawing by ID. Must be owned by the authenticated user.",
        tags=["Drawings"],
    ),
    create=extend_schema(
        summary="Create Drawing",
        description="Creates a new drawing for the authenticated user.",
        tags=["Drawings"],
    ),
    update=extend_schema(
        summary="Update Drawing",
        description="Fully replaces a drawing's data.",
        tags=["Drawings"],
    ),
    partial_update=extend_schema(
        summary="Patch Drawing",
        description="Partially updates a drawing.",
        tags=["Drawings"],
    ),
    destroy=extend_schema(
        summary="Delete Drawing",
        description="Deletes a drawing permanently.",
        tags=["Drawings"],
    ),
)
class DrawingViewSet(
    RevisionedResourceViewSetMixin, SchemaVizViewMixin, viewsets.ModelViewSet
):
    serializer_class = DrawingSerializer
    pagination_class = None
    schema_viz_permission_category = "owner"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]
    queryset = Drawing.objects.all()

    def get_queryset(self):
        return Drawing.objects.for_user(self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class DrawingImportView(SchemaVizViewMixin, GenericAPIView):
    schema_viz_permission_category = "owner"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseMultiPartParser]
    serializer_class = DrawingImportSerializer

    @extend_schema(
        summary="Import SchemeViz Drawing File",
        description=(
            "Uploads a `.schemeviz` drawing file, validates it on the server, "
            "and creates a saved drawing for the authenticated user."
        ),
        request=DrawingImportSerializer,
        responses={
            201: DrawingSerializer,
            400: ErrorResponseSerializer,
        },
        tags=["Drawings"],
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["file"]
        try:
            serialized = uploaded_file.read().decode("utf-8")
        except UnicodeDecodeError as exc:
            raise exceptions.ValidationError(
                {"file": ["SchemeViz files must be UTF-8 encoded JSON."]}
            ) from exc

        drawing_payload = parse_drawing_file_json(serialized)
        drawing = Drawing.objects.create(
            owner=request.user,
            **drawing_payload,
        )

        response_serializer = DrawingSerializer(drawing, context={"request": request})
        response = Response(response_serializer.data, status=status.HTTP_201_CREATED)
        response["ETag"] = f'"{drawing.revision}"'
        return response


class TourProgressView(SchemaVizViewMixin, GenericAPIView):
    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Get Tour Progress",
        description=(
            "Returns the active version for `key` and the authenticated "
            "user's progress for that version. Creates an initial "
            "`not_started` progress row if missing."
        ),
        responses={
            200: TourProgressResourceSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Tours"],
    )
    def get(self, request, key):
        tour = TourDefinition.objects.active_for_key(key).first()
        if not tour:
            return Response(
                {"error": f'No active tour found for key "{key}"'},
                status=status.HTTP_404_NOT_FOUND,
            )

        progress, _ = TourProgress.objects.get_or_create(
            tour=tour,
            user=request.user,
            defaults={
                "status": TourProgress.STATUS_NOT_STARTED,
                "current_step": 0,
                "highest_step": 0,
                "metadata": {},
            },
        )
        return Response(_serialize_tour_progress_entry(tour=tour, progress=progress))

    @extend_schema(
        summary="Update Tour Progress",
        description=(
            "Upserts progress for the authenticated user on the active tour "
            "version for `key`."
        ),
        request=TourProgressUpsertSerializer,
        responses={
            200: TourProgressResourceSerializer,
            400: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Tours"],
    )
    def put(self, request, key):
        tour = TourDefinition.objects.active_for_key(key).first()
        if not tour:
            return Response(
                {"error": f'No active tour found for key "{key}"'},
                status=status.HTTP_404_NOT_FOUND,
            )

        input_serializer = TourProgressUpsertSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        updates = input_serializer.validated_data

        progress, _ = TourProgress.objects.get_or_create(
            tour=tour,
            user=request.user,
            defaults={
                "status": TourProgress.STATUS_NOT_STARTED,
                "current_step": 0,
                "highest_step": 0,
                "metadata": {},
            },
        )

        if "status" in updates:
            progress.status = updates["status"]
        if "current_step" in updates:
            progress.current_step = updates["current_step"]
        if "highest_step" in updates:
            progress.highest_step = max(progress.highest_step, updates["highest_step"])
        progress.highest_step = max(progress.highest_step, progress.current_step)
        if "metadata" in updates:
            progress.metadata = updates["metadata"]

        now = timezone.now()
        if (
            progress.status == TourProgress.STATUS_IN_PROGRESS
            and progress.started_at is None
        ):
            progress.started_at = now
        if progress.status == TourProgress.STATUS_COMPLETED:
            if progress.started_at is None:
                progress.started_at = now
            if progress.completed_at is None:
                progress.completed_at = now
        else:
            progress.completed_at = None

        progress.save()
        return Response(_serialize_tour_progress_entry(tour=tour, progress=progress))


def _build_default_tour_progress_fields():
    return {
        "status": TourProgress.STATUS_NOT_STARTED,
        "current_step": 0,
        "highest_step": 0,
        "metadata": {},
    }


def _get_latest_active_tours() -> list[TourDefinition]:
    tours: list[TourDefinition] = []
    seen_keys: set[str] = set()

    for tour in TourDefinition.objects.active().order_by("key", "-version"):
        if tour.key in seen_keys:
            continue
        seen_keys.add(tour.key)
        tours.append(tour)

    return tours


def _get_or_create_tour_progress(*, tour: TourDefinition, user):
    progress, _ = TourProgress.objects.get_or_create(
        tour=tour,
        user=user,
        defaults=_build_default_tour_progress_fields(),
    )
    return progress


def _serialize_tour_progress_entry(*, tour: TourDefinition, progress: TourProgress):
    return {
        "key": tour.key,
        "version": tour.version,
        "progress": TourProgressSerializer(progress).data,
    }


class TourProgressListView(SchemaVizViewMixin, GenericAPIView):
    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="List Tour Progress",
        description=(
            "Returns every active tour key and the authenticated user's "
            "progress for the latest active version of each key. Creates an "
            "initial `not_started` progress row if missing."
        ),
        responses={200: TourProgressResourceSerializer(many=True)},
        tags=["Tours"],
    )
    def get(self, request):
        payload = []
        for tour in _get_latest_active_tours():
            progress = _get_or_create_tour_progress(tour=tour, user=request.user)
            payload.append(_serialize_tour_progress_entry(tour=tour, progress=progress))
        return Response(payload)


class TemplateUniquenessView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "owner"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Check Template Uniqueness",
        description=(
            "Preflight uniqueness check for style and generation template editing. "
            "Evaluates the current template scope rules before save."
        ),
        request=TemplateUniquenessRequestSerializer,
        responses={
            200: TemplateUniquenessResponseSerializer,
            400: ErrorResponseSerializer,
            403: ErrorResponseSerializer,
        },
        tags=["Templates"],
    )
    def post(self, request):
        serializer = TemplateUniquenessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        if payload["is_global"] and not request.user.is_staff:
            return Response(
                {
                    "error": translate_request(
                        request, "errors.only_staff_global_templates"
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        result = check_template_uniqueness(
            template_kind=payload["template_kind"],
            name=payload["name"],
            owner=request.user,
            is_global=payload["is_global"],
            locale=getattr(request, "schema_viz_locale", None),
            template_id=(
                str(payload["template_id"])
                if payload.get("template_id") is not None
                else None
            ),
            export_name=payload.get("export_name"),
        )
        return Response(TemplateUniquenessResponseSerializer(result).data)


class TemplateMutationUniquenessMixin:
    template_kind: str

    def _raise_if_integrity_conflict(self, serializer, exc: IntegrityError):
        instance = getattr(serializer, "instance", None)
        errors = build_template_uniqueness_errors(
            template_kind=self.template_kind,
            name=serializer.validated_data.get(
                "name", instance.name if instance is not None else ""
            ),
            owner=serializer.validated_data.get(
                "owner", instance.owner if instance is not None else self.request.user
            ),
            is_global=serializer.validated_data.get(
                "is_global", instance.is_global if instance is not None else False
            ),
            locale=getattr(self.request, "schema_viz_locale", None),
            template_id=str(instance.pk) if instance is not None else None,
            export_name=serializer.validated_data.get(
                "export_name", instance.export_name if instance is not None else None
            ),
        )
        if errors:
            raise s.ValidationError(errors)
        raise exc


class TemplateFavoritesView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "owner"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Get Template Favorites",
        description="Returns the authenticated user's favorite style and generation template IDs.",
        responses={200: TemplateFavoritesSerializer},
        tags=["Templates"],
    )
    def get(self, request):
        style_template_ids = list(
            StyleTemplateFavorite.objects.filter(user=request.user)
            .values_list("style_template_id", flat=True)
            .order_by("created_at")
        )
        generation_template_ids = list(
            GenerationTemplateFavorite.objects.filter(user=request.user)
            .values_list("generation_template_id", flat=True)
            .order_by("created_at")
        )
        serializer = TemplateFavoritesSerializer(
            {
                "style_template_ids": style_template_ids,
                "generation_template_ids": generation_template_ids,
            }
        )
        return Response(serializer.data)

    @extend_schema(
        summary="Update Template Favorites",
        description="Replaces the authenticated user's favorite template IDs with the submitted set.",
        request=TemplateFavoritesSerializer,
        responses={200: TemplateFavoritesSerializer},
        tags=["Templates"],
    )
    def put(self, request):
        serializer = TemplateFavoritesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        requested_style_ids = list(
            serializer.validated_data.get("style_template_ids", [])
        )
        requested_generation_ids = list(
            serializer.validated_data.get("generation_template_ids", [])
        )

        accessible_style_id_set = set(
            StyleTemplate.objects.accessible_by_user(request.user)
            .filter(id__in=requested_style_ids)
            .values_list("id", flat=True)
        )
        accessible_generation_id_set = set(
            GenerationTemplate.objects.accessible_by_user(request.user)
            .filter(id__in=requested_generation_ids)
            .values_list("id", flat=True)
        )

        next_style_ids = [
            template_id
            for template_id in requested_style_ids
            if template_id in accessible_style_id_set
        ]
        next_generation_ids = [
            template_id
            for template_id in requested_generation_ids
            if template_id in accessible_generation_id_set
        ]

        current_style_ids = set(
            StyleTemplateFavorite.objects.filter(user=request.user).values_list(
                "style_template_id", flat=True
            )
        )
        current_generation_ids = set(
            GenerationTemplateFavorite.objects.filter(user=request.user).values_list(
                "generation_template_id", flat=True
            )
        )

        StyleTemplateFavorite.objects.filter(
            user=request.user,
            style_template_id__in=current_style_ids - accessible_style_id_set,
        ).delete()
        GenerationTemplateFavorite.objects.filter(
            user=request.user,
            generation_template_id__in=current_generation_ids
            - accessible_generation_id_set,
        ).delete()

        StyleTemplateFavorite.objects.bulk_create(
            [
                StyleTemplateFavorite(user=request.user, style_template_id=template_id)
                for template_id in next_style_ids
                if template_id not in current_style_ids
            ],
            ignore_conflicts=True,
        )
        GenerationTemplateFavorite.objects.bulk_create(
            [
                GenerationTemplateFavorite(
                    user=request.user,
                    generation_template_id=template_id,
                )
                for template_id in next_generation_ids
                if template_id not in current_generation_ids
            ],
            ignore_conflicts=True,
        )

        return Response(
            TemplateFavoritesSerializer(
                {
                    "style_template_ids": next_style_ids,
                    "generation_template_ids": next_generation_ids,
                }
            ).data
        )


@extend_schema_view(
    list=extend_schema(
        summary="List Model Template Defaults",
        description="Returns the current user's per-model default style templates.",
        parameters=[ModelTemplateDefaultRequestsSerializer],
        tags=["Style Templates"],
    ),
    retrieve=extend_schema(
        summary="Get Model Template Default",
        description="Returns a single model template default owned by the current user.",
        tags=["Style Templates"],
    ),
    create=extend_schema(
        summary="Create Model Template Default",
        description="Creates a per-user default style template for a model.",
        tags=["Style Templates"],
    ),
    update=extend_schema(
        summary="Update Model Template Default",
        description="Replaces a per-user default style template for a model.",
        tags=["Style Templates"],
    ),
    partial_update=extend_schema(
        summary="Patch Model Template Default",
        description="Partially updates a per-user default style template for a model.",
        tags=["Style Templates"],
    ),
    destroy=extend_schema(
        summary="Delete Model Template Default",
        description="Deletes a per-user default style template for a model.",
        tags=["Style Templates"],
    ),
)
class ModelTemplateDefaultViewSet(SchemaVizViewMixin, viewsets.ModelViewSet):
    serializer_class = ModelTemplateDefaultSerializer
    pagination_class = None
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    def get_permissions(self):
        return self._resolve_permission_category("owner")

    def get_queryset(self):
        qs = ModelTemplateDefault.objects.for_user(self.request.user).select_related(
            "content_type",
            "style_template",
            "style_template__target_content_type",
        )
        if self.action == "list":
            params = ModelTemplateDefaultRequestsSerializer(
                data=self.request.query_params
            )
            params.is_valid(raise_exception=True)
            model_ref = params.validated_data.get("modelRef")
            if model_ref:
                content_type = resolve_content_type_for_model_ref(model_ref)
                qs = qs.filter(content_type=content_type) if content_type else qs.none()
        return qs

    def perform_create(self, serializer):
        try:
            serializer.save(owner=self.request.user)
        except IntegrityError as exc:
            raise exceptions.ValidationError(
                {"model_ref": ["A default template already exists for this model."]}
            ) from exc

    def perform_update(self, serializer):
        try:
            serializer.save()
        except IntegrityError as exc:
            raise exceptions.ValidationError(
                {"model_ref": ["A default template already exists for this model."]}
            ) from exc


@extend_schema_view(
    list=extend_schema(
        summary="List QLab Model Registry Entries",
        description="Returns staff-manageable QLab model registry entries for frontend administration.",
        tags=["System"],
    ),
    retrieve=extend_schema(
        summary="Get QLab Model Registry Entry",
        description="Returns one QLab model registry entry for frontend administration.",
        tags=["System"],
    ),
    create=extend_schema(
        summary="Create QLab Model Registry Entry",
        description="Creates a QLab model registry entry for a frontend-selected Django model.",
        request=QLabRegistryEntrySerializer,
        responses={201: QLabRegistryEntrySerializer},
        tags=["System"],
    ),
    update=extend_schema(
        summary="Replace QLab Model Registry Entry",
        description="Replaces a QLab model registry entry.",
        request=QLabRegistryEntrySerializer,
        responses={200: QLabRegistryEntrySerializer},
        tags=["System"],
    ),
    partial_update=extend_schema(
        summary="Patch QLab Model Registry Entry",
        description="Partially updates status, restrictions, or allowed groups for a QLab model registry entry.",
        request=QLabRegistryEntrySerializer,
        responses={200: QLabRegistryEntrySerializer},
        tags=["System"],
    ),
    destroy=extend_schema(
        summary="Delete QLab Model Registry Entry",
        description="Deletes a QLab model registry entry.",
        tags=["System"],
    ),
)
class QLabModelRegistryViewSet(SchemaVizViewMixin, viewsets.ModelViewSet):
    serializer_class = QLabRegistryEntrySerializer
    pagination_class = None
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    def get_permissions(self):
        return [permissions.IsAdminUser()]

    def get_queryset(self):
        model_registry = assert_registry_ready()
        return model_registry.objects.all().prefetch_related("allowed_groups")

    @extend_schema(
        summary="List QLab Model Registry Candidate Models",
        description="Returns installed Django models that can be added to the QLab registry but do not yet have an entry.",
        responses={200: QLabRegistryCandidateSerializer(many=True)},
        tags=["System"],
    )
    @action(detail=False, methods=["get"], url_path="candidates")
    def candidates(self, request):
        model_registry = assert_registry_ready()
        existing_labels = set(
            model_registry.objects.values_list("model_label", flat=True)
        )
        payload = []
        for app_config, model in get_manageable_models():
            model_label = f"{app_config.label}_{model.__name__}"
            if model_label in existing_labels:
                continue
            payload.append(
                {
                    "model_ref": f"{app_config.label}.{model._meta.model_name}",
                    "model_label": model_label,
                    "app_label": app_config.label,
                    "model_name": model.__name__,
                    "app_verbose_name": str(app_config.verbose_name),
                    "verbose_name": str(model._meta.verbose_name),
                    "verbose_name_plural": str(model._meta.verbose_name_plural),
                }
            )
        payload.sort(key=lambda item: (item["app_label"], item["model_name"].lower()))
        return Response(QLabRegistryCandidateSerializer(payload, many=True).data)

    @extend_schema(
        summary="List Allowed Django Groups for QLab Model Registry",
        description="Returns Django auth groups that can be assigned to restricted registry entries.",
        responses={200: QLabRegistryGroupSerializer(many=True)},
        tags=["System"],
    )
    @action(detail=False, methods=["get"], url_path="groups")
    def groups(self, request):
        queryset = Group.objects.order_by("name", "id")
        return Response(QLabRegistryGroupSerializer(queryset, many=True).data)


@extend_schema_view(
    list=extend_schema(
        summary="List Style Templates",
        description=(
            "Returns all templates accessible to the user: their own and all global ones. "
            "Pass `model=app_label.ModelName` to filter to templates whose required fields "
            "are all present on that model (full match)."
        ),
        parameters=[StyleTemplateRequestsSerializer],
        tags=["Style Templates"],
    ),
    retrieve=extend_schema(
        summary="Get Style Template",
        description="Returns a single style template by ID.",
        tags=["Style Templates"],
    ),
    create=extend_schema(
        summary="Create Style Template",
        description="Creates a new style template. Only staff can set `is_global=true`.",
        tags=["Style Templates"],
    ),
    update=extend_schema(
        summary="Update Style Template",
        description="Fully replaces a style template. Only the owner can modify their own templates.",
        tags=["Style Templates"],
    ),
    partial_update=extend_schema(
        summary="Patch Style Template",
        description="Partially updates a style template.",
        tags=["Style Templates"],
    ),
    destroy=extend_schema(
        summary="Delete Style Template",
        description="Deletes a style template. Only the owner can delete their own templates.",
        tags=["Style Templates"],
    ),
)
class StyleTemplateViewSet(
    RevisionedResourceViewSetMixin,
    TemplateMutationUniquenessMixin,
    SchemaVizViewMixin,
    viewsets.ModelViewSet,
):
    template_kind = "style"
    queryset = StyleTemplate.objects.none()
    serializer_class = StyleTemplateSerializer
    pagination_class = None
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return self._resolve_permission_category("user_data")
        return self._resolve_permission_category("owner")

    def get_queryset(self):
        if self.action in ["list", "retrieve"]:
            qs = StyleTemplate.objects.accessible_by_user(
                self.request.user
            ).select_related("target_content_type")
        else:
            return StyleTemplate.objects.user_templates(self.request.user)

        if self.action == "list":
            model_param = StyleTemplateRequestsSerializer(
                data=self.request.query_params
            )
            model_param.is_valid(raise_exception=True)
            if app_label := model_param.validated_data.get("app_label"):
                qs = self._filter_compatible(
                    qs, app_label, model_param.validated_data["model_name"]
                )
        return qs

    def _filter_compatible(self, qs, app_label: str, model_name: str):
        root_model = SchemaDiscoveryService.get_model_by_name(
            self.request.user,
            app_label,
            model_name,
        )
        if root_model is None:
            return qs.none()
        requested_content_type = resolve_content_type_for_model_ref(
            f"{app_label}.{model_name}"
        )
        if requested_content_type is None:
            return qs.none()

        model_info_cache = {f"{app_label}.{model_name}": root_model}
        compatible_ids = [
            template.id
            for template in qs
            if StyleTemplateCompatibilityService.are_required_fields_compatible(
                root_model=root_model,
                required_fields=template.required_fields or [],
                user=self.request.user,
                model_info_cache=model_info_cache,
            )
            and (
                not template.is_model_exclusive
                or (
                    template.target_content_type_id == requested_content_type.id
                    and template.target_model_status == "ok"
                )
            )
        ]
        return qs.filter(id__in=compatible_ids)

    def perform_create(self, serializer):
        try:
            serializer.save(owner=self.request.user)
        except IntegrityError as exc:
            self._raise_if_integrity_conflict(serializer, exc)

    def perform_update(self, serializer):
        try:
            serializer.save()
        except IntegrityError as exc:
            self._raise_if_integrity_conflict(serializer, exc)


class GroupTemplateViewSet(
    RevisionedResourceViewSetMixin,
    TemplateMutationUniquenessMixin,
    SchemaVizViewMixin,
    viewsets.ModelViewSet,
):
    template_kind = "group"
    queryset = GroupTemplate.objects.none()
    serializer_class = GroupTemplateSerializer
    pagination_class = None
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return self._resolve_permission_category("user_data")
        return self._resolve_permission_category("owner")

    def get_queryset(self):
        if self.action in ["list", "retrieve"]:
            return GroupTemplate.objects.accessible_by_user(self.request.user)
        return GroupTemplate.objects.user_templates(self.request.user)

    def perform_create(self, serializer):
        try:
            serializer.save(owner=self.request.user)
        except IntegrityError as exc:
            self._raise_if_integrity_conflict(serializer, exc)

    def perform_update(self, serializer):
        try:
            serializer.save()
        except IntegrityError as exc:
            self._raise_if_integrity_conflict(serializer, exc)


class StyleTemplateCompatibilityView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Preflight Style Template Compatibility",
        description=(
            "Evaluates the current style-template draft against accessible models and "
            "returns the live compatibility count, model list, and exclusive target state."
        ),
        request=StyleTemplateCompatibilityRequestSerializer,
        responses={200: StyleTemplateCompatibilityResponseSerializer},
        tags=["Style Templates"],
    )
    def post(self, request):
        serializer = StyleTemplateCompatibilityRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        summary = StyleTemplateCompatibilityService.build_summary(
            required_fields=serializer.validated_data["required_fields"],
            target_model_ref=serializer.validated_data.get("target_model"),
            is_model_exclusive=serializer.validated_data["is_model_exclusive"],
            user=request.user,
        )

        response_payload = {
            "compatible_model_count": summary.compatible_model_count,
            "compatible_models": summary.compatible_models,
            "forced_model": summary.forced_model,
            "forced_model_status": summary.forced_model_status,
        }
        return Response(
            StyleTemplateCompatibilityResponseSerializer(response_payload).data
        )


# ============================================================================
# INTROSPECTION VIEWS (Separate endpoints for better type safety)
# ============================================================================


class SchemaGraphView(SchemaVizViewMixin, APIView):
    """
    GET endpoint to retrieve the complete schema graph with nodes, edges, and groups
    """

    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Get Schema Graph",
        description="Get complete schema graph with nodes, edges, and groups",
        responses={
            200: SchemaGraphSerializer,
            500: inline_serializer(
                name="GraphErrorResponse",
                fields={"error": s.CharField(), "details": s.CharField()},
            ),
        },
        tags=["Schema Introspection"],
    )
    def get(self, request):
        try:
            schema_graph = SchemaDiscoveryService.get_schema(user=request.user)
            response_serializer = SchemaGraphSerializer(instance=schema_graph)
            return Response(response_serializer.data)

        except Exception as e:
            return Response(
                {
                    "error": translate_request(request, "errors.failed_schema_graph"),
                    "details": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# Make sure to import your new serializers at the top of the file:
# from .utils.schema_discovery import SchemaRouteSerializer


class SchemaRouteView(SchemaVizViewMixin, GenericAPIView):
    """
    GET endpoint to find the shortest path between two models for the UI.
    """

    schema_viz_permission_category = "introspection"

    serializer_class = SchemaRouteSerializer
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Find Schema Route",
        description=(
            "Find the shortest path between a start and end model, "
            "formatted as a sequence of fields to traverse. "
            "Optionally pass comma-separated waypoints, preferred models, "
            "and exclusions."
        ),
        parameters=[SchemaRouteRequestSerializer],
        responses={
            200: SchemaRouteSerializer(many=True),
            400: inline_serializer(
                name="RouteBadRequest",
                fields={"error": s.CharField()},
            ),
            404: inline_serializer(
                name="RouteNotFound",
                fields={"error": s.CharField()},
            ),
        },
        tags=["Schema Introspection"],
    )
    def get(self, request):
        input_serializer = SchemaRouteRequestSerializer(
            data=request.query_params,
            context=self.get_serializer_context(),
        )
        input_serializer.is_valid(raise_exception=True)
        start_model_id = input_serializer.validated_data["start_model"]
        end_model_id = input_serializer.validated_data["end_model"]
        waypoints = input_serializer.validated_data["waypoints"]
        preferred_models = input_serializer.validated_data["preferred"]
        excluded_models = input_serializer.validated_data["exclude"]
        limit = input_serializer.validated_data["limit"]
        max_depth = input_serializer.validated_data["max_depth"]

        try:
            raw_paths = SchemaDiscoveryService.find_paths(
                user=request.user,
                start_model_id=start_model_id,
                end_model_id=end_model_id,
                waypoints=waypoints,
                preferred_models=preferred_models,
                excluded_models=excluded_models,
                k=limit,
                max_depth=max_depth,
            )

            if not raw_paths:
                return Response(
                    {
                        "error": f"No valid path found between {start_model_id} and {end_model_id}"
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            # 2. Format it into frontend chips
            frontend_routes = [
                SchemaDiscoveryService.format_path_for_frontend(p) for p in raw_paths
            ]

            # 3. Serialize and return
            response_serializer = SchemaRouteSerializer(
                instance=frontend_routes, many=True
            )
            return Response(response_serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            raise e
            return Response(
                {
                    "error": translate_request(request, "errors.failed_schema_route"),
                    "details": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ModelsListView(SchemaVizViewMixin, GenericAPIView):
    """
    GET endpoint to retrieve all accessible models, optionally filtered by app
    """

    schema_viz_permission_category = "introspection"

    serializer_class = ModelInfoShortSerializer
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="List Models",
        description="Get all accessible models, optionally filtered by app label",
        parameters=[
            OpenApiParameter(
                name="appLabel",
                location="query",
                required=False,
                description="Filter models by app label",
                type=OpenApiTypes.STR,
            ),
            OpenApiParameter(
                name="excludeDjango",
                location="query",
                required=False,
                description="Exclude Django built-in models (default: true)",
                type=OpenApiTypes.BOOL,
                default=True,
            ),
        ],
        responses={
            200: ModelInfoShortSerializer(many=True),
            500: inline_serializer(
                name="ModelsErrorResponse",
                fields={"error": s.CharField(), "details": s.CharField()},
            ),
        },
        tags=["Schema Introspection"],
    )
    def get(self, request):
        try:
            app_label = request.query_params.get("appLabel")
            exclude_django = (
                request.query_params.get("excludeDjango", "true").lower() == "true"
            )

            models_info = map(
                asdict,
                SchemaDiscoveryService.get_all_models(
                    user=request.user,
                    app_label=app_label,
                    exclude_django=exclude_django,
                ),
            )

            return Response(models_info)

        except Exception as e:
            return Response(
                {
                    "error": translate_request(request, "errors.failed_models"),
                    "details": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ModelDetailView(SchemaVizViewMixin, GenericAPIView):
    """
    GET endpoint to retrieve detailed information about a specific model
    """

    schema_viz_permission_category = "introspection"

    serializer_class = ModelInfoSerializer
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Get Model Details",
        description="Get detailed information about a specific model including fields and relationships",
        parameters=[ModelInfoRequestSerializer],
        responses={
            200: ModelInfoSerializer,
            400: inline_serializer(
                name="ModelDetailBadRequest",
                fields={"error": s.CharField()},
            ),
            403: inline_serializer(
                name="ModelDetailForbidden",
                fields={"error": s.CharField()},
            ),
            404: inline_serializer(
                name="ModelDetailNotFound",
                fields={"error": s.CharField()},
            ),
        },
        tags=["Schema Introspection"],
    )
    def get(self, request):
        request_serializer = ModelInfoRequestSerializer(data=request.query_params)
        request_serializer.is_valid(raise_exception=True)
        app_label = request_serializer.validated_data[
            "app_label"
        ]  # ignore[reportIndexIssue]
        model_name = request_serializer.validated_data["model_name"]  # type: ignore
        # Check if model is accessible via whitelist
        if not is_model_accessible_for_user(request.user, app_label, model_name):
            return Response(
                {"error": f"Model {app_label}.{model_name} is not accessible"},
                status=status.HTTP_403_FORBIDDEN,
            )

        model_info = SchemaDiscoveryService.get_model_by_name(
            request.user,
            app_label,
            model_name,
        )

        if model_info is None:
            return Response(
                {"error": f"Model {app_label}.{model_name} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(asdict(model_info))


class AppsListView(SchemaVizViewMixin, APIView):
    """
    GET endpoint to retrieve all apps with accessible models
    """

    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="List Apps",
        description="Get all apps that have at least one accessible model",
        responses={
            200: inline_serializer(
                name="AppsListResponse",
                fields={
                    "apps": s.ListField(child=s.DictField()),
                },
            ),
            500: inline_serializer(
                name="AppsErrorResponse",
                fields={"error": s.CharField(), "details": s.CharField()},
            ),
        },
        tags=["Schema Introspection"],
    )
    def get(self, request):
        try:
            apps_info = SchemaDiscoveryService.get_all_apps(user=request.user)
            return Response({"apps": apps_info})

        except Exception as e:
            return Response(
                {
                    "error": translate_request(request, "errors.failed_apps"),
                    "details": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class QueryListView(SchemaVizViewMixin, GenericAPIView):
    """
    GET  - list records with search and ordering via query params
    Both return the same paginated response shape.
    """

    schema_viz_permission_category = "introspection"

    pagination_class = QueryPagination
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="List Model Records",
        description="List records for a model. Use query params for search, ordering and filtering.",
        parameters=[QueryFilterSerializer],
        responses={
            200: QueryResponseSerializer,
            400: ErrorResponseSerializer,
            403: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Query"],
    )
    def get(self, request, app_label, model_name) -> Response:
        model, error = self._get_model(app_label, model_name)
        if error:
            return error

        query_serializer = QueryFilterSerializer(data=request.query_params)
        if not query_serializer.is_valid():
            return Response(
                {"error": "Invalid query params", "details": query_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        search = query_serializer.validated_data.get("search")
        ordering = query_serializer.validated_data.get("ordering", "")
        ordering_fields = [o for o in ordering.split(",") if o] if ordering else []
        field_filters = query_serializer.get_field_filters()

        try:
            queryset = self._build_queryset(
                model, search=search, field_filters=field_filters or None
            )
            if ordering_fields:
                queryset = queryset.order_by(*ordering_fields)
            return self._paginate_and_respond(request, queryset, model)
        except FieldError as e:
            return Response(
                {"error": "Invalid filter or ordering field", "details": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"error": "Query failed", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _get_model(self, app_label, model_name):
        """Resolve and permission-check the model from URL kwargs."""
        if not is_model_accessible_for_user(self.request.user, app_label, model_name):
            return None, Response(
                {"error": f"Model {app_label}.{model_name} is not accessible"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            return apps.get_model(app_label, model_name), None
        except LookupError:
            return None, Response(
                {"error": f"Model {app_label}.{model_name} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    def _build_queryset(self, model, search=None, field_filters=None):
        """Build queryset with filters applied"""
        queryset = model.objects.all()

        if field_filters:
            queryset = queryset.filter(**field_filters)

        if search:
            search_fields = [
                f.name
                for f in model._meta.get_fields()
                if f.__class__.__name__ in ["CharField", "TextField"]
            ]
            if search_fields:
                q_objects = Q()
                for field in search_fields:
                    q_objects |= Q(**{f"{field}__icontains": search})
                queryset = queryset.filter(q_objects)

        return queryset

    def _paginate_and_respond(self, request, queryset, model):
        paginated_queryset = self.paginate_queryset(queryset)
        serializer_class = DynamicModelSerializer.for_model(model)

        target = paginated_queryset if paginated_queryset is not None else queryset
        data = serializer_class(target, many=True).data
        results = QueryResponseSerializer(
            [
                {"fields": item, "display_name": str(instance)}
                for item, instance in zip(data, target)
            ],
            many=True,
        )

        if paginated_queryset is not None:
            return self.get_paginated_response(results.data)
        return Response(results.data)


class QueryRetrieveView(SchemaVizViewMixin, GenericAPIView):
    """
    GET /query/{app_label}/{model_name}/{pk}/
    Returns a single record by primary key.
    """

    schema_viz_permission_category = "introspection"

    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Retrieve Model Record",
        description="Retrieve a single record by primary key.",
        responses={
            200: QueryResponseSerializer,
            403: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Query"],
    )
    def get(self, request, app_label, model_name, pk) -> Response:
        if not is_model_accessible_for_user(request.user, app_label, model_name):
            return Response(
                {"error": f"Model {app_label}.{model_name} is not accessible"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:
            return Response(
                {"error": f"Model {app_label}.{model_name} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            instance = model.objects.get(pk=pk)
        except model.DoesNotExist:
            return Response(
                {"error": f"Record with pk={pk} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer_class = DynamicModelSerializer.for_model(model)
        data = serializer_class(instance).data
        response = QueryResponseSerializer(
            {"fields": data, "display_name": str(instance)}
        )
        return Response(response.data)


@extend_schema_view(
    list=extend_schema(
        summary="List Generation Templates",
        description=(
            "Returns accessible generation templates with draft/published version summaries. "
            "Supports filtering by scope, published state, featured state, owner, and "
            "optional sample runs for home/library surfaces."
        ),
        tags=["Generation Templates"],
    ),
    retrieve=extend_schema(
        summary="Get Generation Template",
        description="Returns a single generation template with full draft and published versions.",
        tags=["Generation Templates"],
    ),
    create=extend_schema(
        summary="Create Generation Template",
        description="Creates a new draft generation template.",
        tags=["Generation Templates"],
    ),
    update=extend_schema(
        summary="Update Generation Template",
        description="Fully replaces the current draft definition and metadata.",
        tags=["Generation Templates"],
    ),
    partial_update=extend_schema(
        summary="Patch Generation Template",
        description="Alias for full draft replacement.",
        tags=["Generation Templates"],
    ),
    destroy=extend_schema(
        summary="Delete Generation Template",
        description="Deletes the template container and all stored versions.",
        tags=["Generation Templates"],
    ),
)
class GenerationTemplateViewSet(
    RevisionedResourceViewSetMixin,
    SchemaVizViewMixin,
    viewsets.ModelViewSet,
):
    queryset = GenerationTemplate.objects.none()
    pagination_class = None
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return self._resolve_permission_category("user_data")
        return self._resolve_permission_category("owner")

    def get_queryset(self):
        if self.action in ["list", "retrieve"]:
            return GenerationTemplate.objects.accessible_by_user(self.request.user)
        return GenerationTemplate.objects.filter(owner=self.request.user)

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return GenerationTemplateWriteSerializer
        if self.action == "list":
            return GenerationTemplateListSerializer
        return GenerationTemplateReadSerializer

    def _apply_list_filters(self, queryset):
        params = self.request.query_params
        scope = params.get("scope")
        published = params.get("published")
        featured = params.get("featured")
        owner = params.get("owner")

        if scope == "global":
            queryset = queryset.filter(is_global=True)
        elif scope == "owner":
            queryset = queryset.filter(owner=self.request.user, is_global=False)

        if published == "true":
            queryset = queryset.filter(published_version__isnull=False)
        elif published == "false":
            queryset = queryset.filter(published_version__isnull=True)

        if featured == "true":
            queryset = queryset.filter(is_featured=True)
        elif featured == "false":
            queryset = queryset.filter(is_featured=False)

        if owner == "me":
            queryset = queryset.filter(owner=self.request.user)
        elif owner:
            queryset = queryset.filter(owner_id=owner)

        return queryset

    def list(self, request, *args, **kwargs):
        include_sample = request.query_params.get("includeSample") == "true"
        queryset = self._apply_list_filters(self.get_queryset()).order_by(
            "feature_rank", "-updated_at"
        )
        serializer = self.get_serializer(queryset, many=True)
        payload = serializer.data

        if include_sample:
            for item, template in zip(payload, queryset):
                item["sample"] = build_generation_template_sample_payload(
                    request, template
                )

        return Response(payload)

    def retrieve(self, request, *args, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(template)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        unique_name = generate_unique_template_name(
            base_name=payload["name"],
            template_kind="generation",
            owner=request.user,
            is_global=payload["is_global"],
        )

        try:
            template = GenerationTemplate.objects.create(
                owner=request.user,
                name=unique_name,
                description=payload.get("description", ""),
                root_model=payload["root_model"],
                export_name=payload.get("export_name"),
                steps=payload["definition"],
                layout_settings=payload.get("layout_settings", {}),
                is_global=payload["is_global"],
                is_featured=payload["is_featured"],
                feature_rank=payload["feature_rank"],
            )
        except IntegrityError as exc:
            raise s.ValidationError(
                build_template_uniqueness_errors(
                    template_kind="generation",
                    name=unique_name,
                    owner=request.user,
                    is_global=payload["is_global"],
                    locale=getattr(request, "schema_viz_locale", None),
                    export_name=payload.get("export_name"),
                )
            ) from exc

        version = create_generation_template_version(
            template=template,
            root_model=payload["root_model"],
            definition=payload["definition"],
            layout_settings=payload.get("layout_settings", {}),
            created_by=request.user,
        )
        GenerationTemplate.objects.filter(pk=template.pk).update(draft_version=version)
        template.refresh_from_db()

        response_serializer = GenerationTemplateReadSerializer(
            template,
            context={"request": request},
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        conflict_response = self._enforce_if_match()
        if conflict_response is not None:
            return conflict_response

        template = self.get_object()
        serializer = self.get_serializer(template, data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        version = create_generation_template_version(
            template=template,
            root_model=payload["root_model"],
            definition=payload["definition"],
            layout_settings=payload.get("layout_settings", {}),
            created_by=request.user,
        )

        template.name = payload["name"]
        template.description = payload.get("description", "")
        template.root_model = payload["root_model"]
        template.export_name = payload.get("export_name")
        template.steps = payload["definition"]
        template.layout_settings = payload.get("layout_settings", {})
        template.is_global = payload["is_global"]
        template.is_featured = payload["is_featured"]
        template.feature_rank = payload["feature_rank"]
        template.draft_version = version

        try:
            template.save()
        except IntegrityError as exc:
            raise s.ValidationError(
                build_template_uniqueness_errors(
                    template_kind="generation",
                    name=payload["name"],
                    owner=request.user,
                    is_global=payload["is_global"],
                    locale=getattr(request, "schema_viz_locale", None),
                    template_id=str(template.pk),
                    export_name=payload.get("export_name"),
                )
            ) from exc

        response_serializer = GenerationTemplateReadSerializer(
            template,
            context={"request": request},
        )
        return Response(response_serializer.data)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @extend_schema(
        summary="Publish Generation Template",
        description="Snapshots the current draft as a new published version.",
        request=None,
        responses={200: GenerationTemplateReadSerializer},
        tags=["Generation Templates"],
    )
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        template = self.get_object()
        if template.draft_version is None:
            return Response(
                {"error": "Draft version not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        published_version = create_generation_template_version(
            template=template,
            root_model=template.draft_version.root_model,
            definition=template.draft_version.definition,
            layout_settings=template.draft_version.layout_settings,
            created_by=request.user,
        )
        template.published_version = published_version
        template.published_at = timezone.now()
        template.published_by = request.user
        template.save(
            update_fields=["published_version", "published_at", "published_by"]
        )
        template.refresh_from_db()

        serializer = GenerationTemplateReadSerializer(
            template,
            context={"request": request},
        )
        return Response(serializer.data)

    @extend_schema(
        summary="Unpublish Generation Template",
        description="Clears the published version while keeping the current draft intact.",
        request=None,
        responses={200: GenerationTemplateReadSerializer},
        tags=["Generation Templates"],
    )
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        template = self.get_object()
        template.published_version = None
        template.published_at = None
        template.published_by = None
        template.save(
            update_fields=["published_version", "published_at", "published_by"]
        )
        template.refresh_from_db()

        serializer = GenerationTemplateReadSerializer(
            template,
            context={"request": request},
        )
        return Response(serializer.data)


class GenerationRunView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Run Generation",
        description=(
            "Resolves a draft, published, or inline generation definition and returns "
            "either a structure preview or live/share generation result."
        ),
        request=GenerationRunRequestSerializer,
        responses={
            200: GenerationRunResponseSerializer,
            400: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Generation Templates"],
    )
    def post(self, request):
        serializer = GenerationRunRequestSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        source = payload["source"]
        template = None
        version = None
        version_label = "inline"

        if source.get("template_id") is not None:
            try:
                template = GenerationTemplate.objects.accessible_by_user(
                    request.user
                ).get(pk=source["template_id"])
            except GenerationTemplate.DoesNotExist:
                return Response(
                    {"error": "Generation template not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            version_label = source["version"]
            if version_label == "draft" and template.owner != request.user:
                return Response(
                    {
                        "error": "Draft versions are only available to the template owner."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            version = (
                template.draft_version
                if version_label == "draft"
                else template.published_version
            )
            if payload["mode"] == "share" and version_label != "published":
                return Response(
                    {"error": "Share runs require a published template source."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if version is None:
                return Response(
                    {"error": f"{version_label.capitalize()} version not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            version_label = "inline"
            if payload["mode"] == "share":
                return Response(
                    {"error": "Share runs require a published template source."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        root_model = version.root_model if version is not None else source["root_model"]
        definition = (
            version.definition if version is not None else source["inline_definition"]
        )
        layout_settings = (
            version.layout_settings
            if version is not None
            else source.get("layout_settings", {})
        )

        try:
            engine = GenerationEngine(
                root_model=root_model,
                definition=definition,
                user=request.user,
                layout_settings=layout_settings,
            )
            if payload["mode"] == "structure" and payload.get("record_id") is None:
                generation_result = engine.preview_structure()
            else:
                generation_result = engine.execute(record_pk=payload["record_id"])
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except GenerationStepValidationError as exc:
            return Response(
                {
                    "error": translate_request(request, "errors.execution_failed"),
                    "details": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {
                    "error": translate_request(request, "errors.execution_failed"),
                    "details": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            build_generation_run_response(
                request,
                mode=payload["mode"],
                generation_result=generation_result,
                template=template,
                version=version,
                version_label=version_label,
                root_model=root_model,
                layout_settings=layout_settings,
            )
        )


class SharedGenerationTemplateView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]

    @extend_schema(
        operation_id="schemaVizGenerateTemplateRetrieve",
        summary="Get Shared Generation Template",
        description="Resolves the published template metadata for a share slug.",
        responses={200: GenerationTemplateReadSerializer, 404: ErrorResponseSerializer},
        tags=["Generation Templates"],
    )
    def get(self, request, share_slug):
        try:
            template = GenerationTemplate.objects.get(
                export_name=share_slug,
                published_version__isnull=False,
            )
        except GenerationTemplate.DoesNotExist:
            return Response(
                {"error": "Generation template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = GenerationTemplateReadSerializer(
            template,
            context={"request": request},
        )
        return Response(serializer.data)


class SharedGenerationRunView(SchemaVizViewMixin, APIView):
    schema_viz_permission_category = "user_data"
    renderer_classes = [CamelCaseJSONRenderer]

    @extend_schema(
        operation_id="schemaVizGenerateRunRetrieve",
        summary="Run Shared Generation",
        description="Runs the published template resolved by share slug and record id.",
        responses={200: None, 404: ErrorResponseSerializer},
        tags=["Generation Templates"],
    )
    def get(self, request, share_slug, record_id):
        try:
            template = GenerationTemplate.objects.get(
                export_name=share_slug,
                published_version__isnull=False,
            )
        except GenerationTemplate.DoesNotExist:
            return Response(
                {"error": "Generation template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        version = template.published_version
        try:
            generation_result = GenerationEngine(
                root_model=version.root_model,
                definition=version.definition,
                user=request.user,
                layout_settings=version.layout_settings,
            ).execute(record_pk=record_id)
        except GenerationStepValidationError as exc:
            return Response(
                {
                    "error": "Generation share is not accessible.",
                    "details": str(exc),
                    "code": "GENERATION_SHARE_ACCESS_DENIED",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            return Response(
                {"error": "Generation share failed.", "details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            build_generation_run_response(
                request,
                mode="share",
                generation_result=generation_result,
                template=template,
                version=version,
                version_label="published",
                root_model=version.root_model,
                layout_settings=version.layout_settings,
            )
        )


class NoQueryFormatOverrideNegotiation(DefaultContentNegotiation):
    """Ignore DRF's `?format=` override; only honor URL format suffixes."""

    def select_renderer(self, request, renderers, format_suffix=None):
        # Keep suffix-based format resolution but ignore query-param override.
        if format_suffix:
            renderers = self.filter_renderers(renderers, format_suffix)

        accepts = self.get_accept_list(request)
        for media_type_set in order_by_precedence(accepts):
            for renderer in renderers:
                for media_type in media_type_set:
                    if media_type_matches(renderer.media_type, media_type):
                        media_type_wrapper = _MediaType(media_type)
                        if (
                            _MediaType(renderer.media_type).precedence
                            > media_type_wrapper.precedence
                        ):
                            full_media_type = ";".join(
                                (renderer.media_type,)
                                + tuple(
                                    f"{key}={value}"
                                    for key, value in media_type_wrapper.params.items()
                                )
                            )
                            return renderer, full_media_type
                        return renderer, media_type

        raise exceptions.NotAcceptable(available_renderers=renderers)


class DrawingExportView(SchemaVizViewMixin, APIView):
    """
    Export a drawing in various formats.

    Currently supports: drawio (default), svg
    """

    schema_viz_permission_category = "user_data"
    content_negotiation_class = NoQueryFormatOverrideNegotiation
    MIN_EXPORT_DIMENSION = 256
    MAX_EXPORT_DIMENSION = 8000
    MAX_EXPORT_PIXELS = 40_000_000

    @extend_schema(
        summary="Export Drawing",
        description=(
            "Export a drawing as draw.io XML or rendered SVG. "
            "Use `exportFormat=drawio` for diagrams.net XML, or `exportFormat=svg` "
            "for deterministic image rendering from stored graph data."
        ),
        parameters=[
            OpenApiParameter(
                name="exportFormat",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="Export format.",
                default="drawio",
                enum=["drawio", "svg"],
            ),
            OpenApiParameter(
                name="mode",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="SVG render mode. 'fit' fits and centers all nodes. 'current' uses saved viewport.",
                default="fit",
                enum=["current", "fit"],
                required=False,
            ),
            OpenApiParameter(
                name="width",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description=(
                    "SVG canvas width in pixels. Defaults to 1920. "
                    f"Allowed range: {MIN_EXPORT_DIMENSION}..{MAX_EXPORT_DIMENSION}."
                ),
                required=False,
            ),
            OpenApiParameter(
                name="height",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description=(
                    "SVG canvas height in pixels. Defaults to 1080. "
                    f"Allowed range: {MIN_EXPORT_DIMENSION}..{MAX_EXPORT_DIMENSION}."
                ),
                required=False,
            ),
            OpenApiParameter(
                name="background",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="SVG background: hex color (#rrggbb) or 'transparent'. Defaults to #ffffff.",
                required=False,
                default="#ffffff",
            ),
        ],
        responses={
            (200, "application/xml"): OpenApiTypes.STR,
            (200, "image/svg+xml"): OpenApiTypes.STR,
            404: {"description": "Drawing not found"},
        },
        tags=["Drawings"],
    )
    def get(self, request, pk):
        try:
            drawing = Drawing.objects.for_user(request.user).get(pk=pk)
        except Drawing.DoesNotExist:
            return Response(
                {"error": "Drawing not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Use a custom query param name to avoid DRF's built-in `?format=...`
        # renderer override handling.
        export_format = (
            request.query_params.get("exportFormat")
            or request.query_params.get("export_format")
            or request.query_params.get("format")
            or "drawio"
        )

        if export_format not in {"drawio", "svg"}:
            return Response(
                {"error": f"Unsupported format: {export_format}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Sanitize filename
        safe_title = "".join(
            c for c in (drawing.title or "drawing") if c.isalnum() or c in " -_"
        ).strip()
        file_base = safe_title or "drawing"

        react_flow_state = drawing.react_flow_state or {}
        lexical_state = drawing.lexical_state or {}

        if export_format == "drawio":
            xml = export_drawing_to_drawio(
                react_flow_state=react_flow_state,
                lexical_state=lexical_state,
            )
            filename = f"{file_base}.drawio"
            response = HttpResponse(xml, content_type="application/xml")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        mode = (request.query_params.get("mode") or "fit").lower()
        if mode not in {"current", "fit"}:
            return Response(
                {"error": f"Unsupported mode: {mode}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            width = (
                int(request.query_params.get("width"))
                if request.query_params.get("width")
                else None
            )
            height = (
                int(request.query_params.get("height"))
                if request.query_params.get("height")
                else None
            )
        except ValueError:
            return Response(
                {"error": "width and height must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if width is not None and not (
            self.MIN_EXPORT_DIMENSION <= width <= self.MAX_EXPORT_DIMENSION
        ):
            return Response(
                {
                    "error": (
                        f"width must be between {self.MIN_EXPORT_DIMENSION} and "
                        f"{self.MAX_EXPORT_DIMENSION}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if height is not None and not (
            self.MIN_EXPORT_DIMENSION <= height <= self.MAX_EXPORT_DIMENSION
        ):
            return Response(
                {
                    "error": (
                        f"height must be between {self.MIN_EXPORT_DIMENSION} and "
                        f"{self.MAX_EXPORT_DIMENSION}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            width is not None
            and height is not None
            and (width * height) > self.MAX_EXPORT_PIXELS
        ):
            return Response(
                {
                    "error": (
                        f"width*height exceeds maximum export pixels ({self.MAX_EXPORT_PIXELS})"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Scale factor (optional, defaults to 1.0).
        try:
            scale_factor = (
                float(request.query_params.get("scaleFactor"))
                if request.query_params.get("scaleFactor")
                else 1.0
            )
        except ValueError:
            scale_factor = 1.0
        scale_factor = max(0.25, min(4.0, scale_factor))

        # Background color (optional, defaults to white).
        import re as _re

        background = request.query_params.get("background", "#ffffff")
        if background != "transparent" and not _re.match(
            r"^#[0-9a-fA-F]{6}$", background
        ):
            return Response(
                {"error": "background must be 'transparent' or a 6-digit hex color."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        svg = export_drawing_to_svg(
            react_flow_state=react_flow_state,
            lexical_state=lexical_state,
            width=width,
            height=height,
            mode=mode,
            scale_factor=scale_factor,
            background=background,
        )
        filename = f"{file_base}.svg"
        response = HttpResponse(svg, content_type="image/svg+xml")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class StatelessExportView(SchemaVizViewMixin, APIView):
    """
    Export a canvas as SVG or DrawIO without requiring a saved Drawing.

    Accepts the full react_flow_state + lexical_state via POST body so
    callers (e.g. the generation-template export page) do not need to
    persist a Drawing first.
    """

    schema_viz_permission_category = "user_data"
    content_negotiation_class = NoQueryFormatOverrideNegotiation
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Stateless Canvas Export",
        description=(
            "Export a canvas snapshot as SVG or Draw.io XML. "
            "The caller sends the full React Flow state in the request body — "
            "no saved Drawing is required."
        ),
        request=StatelessExportSerializer,
        responses={
            (200, "application/xml"): OpenApiTypes.STR,
            (200, "image/svg+xml"): OpenApiTypes.STR,
            400: {"description": "Validation error"},
        },
        tags=["Export"],
    )
    def post(self, request):
        serializer = StatelessExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        react_flow_state = payload["react_flow_state"]
        lexical_state = payload.get("lexical_state") or {}
        export_format = payload["export_format"]
        mode = payload.get("mode") or "fit"
        width = payload.get("width")
        height = payload.get("height")
        file_name = payload.get("file_name") or "export"
        scale_factor = payload.get("scale_factor", 1.0)
        background = payload.get("background", "#ffffff")

        # Sanitize filename
        safe_name = (
            "".join(c for c in file_name if c.isalnum() or c in " -_").strip()
            or "export"
        )

        if export_format == "drawio":
            xml = export_drawing_to_drawio(
                react_flow_state=react_flow_state,
                lexical_state=lexical_state,
            )
            response = HttpResponse(xml, content_type="application/xml")
            response["Content-Disposition"] = (
                f'attachment; filename="{safe_name}.drawio"'
            )
            return response

        # SVG export
        svg = export_drawing_to_svg(
            react_flow_state=react_flow_state,
            lexical_state=lexical_state,
            width=width,
            height=height,
            mode=mode,
            scale_factor=scale_factor,
            background=background,
        )
        response = HttpResponse(svg, content_type="image/svg+xml")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}.svg"'
        return response


class SchemaRouteProbeView(SchemaVizViewMixin, GenericAPIView):
    """
    POST endpoint to test whether a schema route yields actual data.
    Performs lightweight COUNT queries per hop to check path viability.
    """

    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @extend_schema(
        summary="Probe Schema Route",
        description=(
            "Test whether a schema path between two models yields actual data. "
            "Performs COUNT queries per hop to determine viability."
        ),
        request=inline_serializer(
            name="RouteProbeRequest",
            fields={
                "route": s.ListField(
                    child=s.DictField(),
                    help_text="Route steps from find_path: [{fromModel, toModel, viaField, isForward}]",
                ),
                "sample_record_id": s.CharField(
                    required=False, help_text="Optional start record ID"
                ),
                "sample_size": s.IntegerField(
                    required=False, default=5, min_value=1, max_value=20
                ),
            },
        ),
        parameters=[
            OpenApiParameter(
                name="startModel",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
            ),
            OpenApiParameter(
                name="endModel",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
            ),
        ],
        responses={
            200: inline_serializer(
                name="RouteProbeResponse",
                fields={
                    "viable": s.BooleanField(),
                    "coverage": s.FloatField(),
                    "steps": s.ListField(child=s.DictField()),
                },
            ),
            400: inline_serializer(
                name="RouteProbeBadRequest",
                fields={"error": s.CharField()},
            ),
        },
        tags=["Schema Introspection"],
    )
    def post(self, request):
        start_model_ref = request.query_params.get("startModel", "")
        end_model_ref = request.query_params.get("endModel", "")
        route = request.data.get("route", [])
        sample_record_id = request.data.get("sample_record_id")
        sample_size = min(int(request.data.get("sample_size", 5)), 20)

        if not start_model_ref or not end_model_ref:
            return Response(
                {"error": "startModel and endModel query parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not route or not isinstance(route, list):
            return Response(
                {"error": "route must be a non-empty list of step objects"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        probe_steps = []
        all_reachable = True

        for step in route:
            from_model_ref = step.get("fromModel", step.get("from_model", ""))
            to_model_ref = step.get("toModel", step.get("to_model", ""))
            via_field = step.get("viaField", step.get("via_field", ""))
            is_forward = step.get("isForward", step.get("is_forward", True))

            if not from_model_ref or not via_field:
                probe_steps.append(
                    {
                        "fromModel": from_model_ref,
                        "toModel": to_model_ref,
                        "viaField": via_field,
                        "recordsFound": 0,
                        "reachable": False,
                        "error": "Invalid step data",
                    }
                )
                all_reachable = False
                continue

            try:
                from_parts = from_model_ref.split(".")
                from_model = apps.get_model(from_parts[0], from_parts[1])

                if is_forward:
                    # Forward: count records in from_model that have a non-null FK
                    field = from_model._meta.get_field(via_field)
                    if hasattr(field, "get_attname"):
                        # FK/O2O — count non-null
                        attname = field.get_attname()
                        qs = from_model.objects.exclude(**{f"{attname}__isnull": True})
                    else:
                        # M2M forward
                        qs = from_model.objects.filter(
                            **{f"{via_field}__isnull": False}
                        ).distinct()

                    if sample_record_id:
                        qs = qs.filter(pk=sample_record_id)

                    count = qs[:sample_size].count()
                else:
                    # Reverse: count records in to_model that reference from_model
                    to_parts = to_model_ref.split(".")
                    to_model = apps.get_model(to_parts[0], to_parts[1])

                    if sample_record_id:
                        qs = to_model.objects.filter(
                            **{f"{via_field}": sample_record_id}
                        )
                    else:
                        qs = to_model.objects.all()

                    count = qs[:sample_size].count()

                reachable = count > 0
                if not reachable:
                    all_reachable = False

                probe_steps.append(
                    {
                        "fromModel": from_model_ref,
                        "toModel": to_model_ref,
                        "viaField": via_field,
                        "recordsFound": count,
                        "reachable": reachable,
                    }
                )

            except Exception as e:
                probe_steps.append(
                    {
                        "fromModel": from_model_ref,
                        "toModel": to_model_ref,
                        "viaField": via_field,
                        "recordsFound": 0,
                        "reachable": False,
                        "error": str(e),
                    }
                )
                all_reachable = False

        total_steps = len(probe_steps)
        reachable_steps = sum(1 for s in probe_steps if s.get("reachable"))
        coverage = reachable_steps / total_steps if total_steps > 0 else 0.0

        return Response(
            {
                "viable": all_reachable,
                "coverage": round(coverage, 2),
                "steps": probe_steps,
            },
            status=status.HTTP_200_OK,
        )
