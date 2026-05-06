from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .query_lab import (
    QueryMetadataView,
    QueryNeighborhoodView,
    QueryRecordView,
    QueryRecordsView,
)
from .views import (
    AiConfigSecretView,
    BackendVersionView,
    SessionCapabilitiesView,
    ShapesListView,
    SchemaGraphView,
    ModelsListView,
    ModelDetailView,
    AppsListView,
    DrawingViewSet,
    GroupTemplateViewSet,
    StyleTemplateViewSet,
    ModelTemplateDefaultViewSet,
    QLabModelRegistryViewSet,
    GenerationTemplateViewSet,
    GenerationRunView,
    SchemaRouteView,
    SchemaRouteProbeView,
    SharedGenerationTemplateView,
    SharedGenerationRunView,
    DrawingExportView,
    DrawingImportView,
    StatelessExportView,
    TemplateFavoritesView,
    StyleTemplateCompatibilityView,
    TemplateUniquenessView,
    TourProgressListView,
    TourProgressView,
    GenerationTemplateOwnRecentQuickAccessView,
    FeaturedGenerationTemplateQuickAccessView,
)

app_name = "schema_viz"
router = DefaultRouter()
router.register(r"drawings", DrawingViewSet, basename="drawing")
router.register(r"templates", StyleTemplateViewSet, basename="styletemplate")
router.register(r"group-templates", GroupTemplateViewSet, basename="grouptemplate")
router.register(r"model-registry", QLabModelRegistryViewSet, basename="modelregistry")
router.register(
    r"model-template-defaults",
    ModelTemplateDefaultViewSet,
    basename="modeltemplatedefault",
)
router.register(
    r"generation-templates", GenerationTemplateViewSet, basename="generationtemplate"
)

urlpatterns = [
    path("version/", BackendVersionView.as_view(), name="version"),
    path("session/", SessionCapabilitiesView.as_view(), name="session"),
    path("session/ai-config/", AiConfigSecretView.as_view(), name="ai-config-secret"),
    path("shapes/", ShapesListView.as_view(), name="shapes"),
    path(
        "tours/progress/",
        TourProgressListView.as_view(),
        name="tour-progress-list",
    ),
    path(
        "tours/<slug:key>/progress/",
        TourProgressView.as_view(),
        name="tour-progress",
    ),
    path(
        "drawings/<uuid:pk>/export/",
        DrawingExportView.as_view(),
        name="drawing-export",
    ),
    path(
        "drawings/import/",
        DrawingImportView.as_view(),
        name="drawing-import",
    ),
    path(
        "export/",
        StatelessExportView.as_view(),
        name="stateless-export",
    ),
    path("generation-runs/", GenerationRunView.as_view(), name="generation-runs"),
    path(
        "generate/<slug:share_slug>/",
        SharedGenerationTemplateView.as_view(),
        name="generation-shared-template",
    ),
    path(
        "generate/<slug:share_slug>/<str:record_id>/",
        SharedGenerationRunView.as_view(),
        name="generation-shared-run",
    ),
    path("graph/", SchemaGraphView.as_view(), name="graph"),
    path("models/", ModelsListView.as_view(), name="models"),
    path("route/", SchemaRouteView.as_view(), name="schema-route"),
    path("route/probe/", SchemaRouteProbeView.as_view(), name="schema-route-probe"),
    path("model-details/", ModelDetailView.as_view(), name="model-details"),
    path("apps/", AppsListView.as_view(), name="apps"),
    path(
        "template-uniqueness/",
        TemplateUniquenessView.as_view(),
        name="template-uniqueness",
    ),
    path(
        "template-favorites/",
        TemplateFavoritesView.as_view(),
        name="template-favorites",
    ),
    path(
        "template-compatibility/",
        StyleTemplateCompatibilityView.as_view(),
        name="template-compatibility",
    ),
    path(
        "generation-template-quick-access/",
        GenerationTemplateOwnRecentQuickAccessView.as_view(),
        name="generation-template-own-recent-quick-access",
    ),
    path(
        "generation-template-quick-access/featured/",
        FeaturedGenerationTemplateQuickAccessView.as_view(),
        name="generation-template-featured-quick-access",
    ),
    path("", include(router.urls)),
    path("query/records/", QueryRecordsView.as_view(), name="query-records"),
    path("query/record/", QueryRecordView.as_view(), name="query-record"),
    path("query/metadata/", QueryMetadataView.as_view(), name="query-metadata"),
    path(
        "query/neighborhood/",
        QueryNeighborhoodView.as_view(),
        name="query-neighborhood",
    ),
]
