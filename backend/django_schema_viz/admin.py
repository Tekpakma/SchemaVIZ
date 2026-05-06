import json
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Drawing,
    GenerationTemplate,
    GenerationTemplateVersion,
    GroupTemplate,
    SchemaVizUserPreference,
    StyleTemplate,
    TourDefinition,
    TourProgress,
)
from django.utils.safestring import mark_safe


# ============================================================================
# DRAWING
# ============================================================================


@admin.register(Drawing)
class DrawingAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "node_count", "updated_at", "created_at")
    list_filter = ("owner",)
    search_fields = ("title", "description", "owner__username")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "pretty_react_flow_state",
        "pretty_lexical_state",
    )

    fieldsets = (
        ("Basic", {"fields": ("id", "title", "description", "owner")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
        ("React Flow State", {"fields": ("pretty_react_flow_state",)}),
        ("Lexical State", {"fields": ("pretty_lexical_state",)}),
    )

    @admin.display(description="Nodes")
    def node_count(self, obj):
        state = obj.react_flow_state or {}
        return len(state.get("nodes", []))

    @admin.display(description="React Flow State")
    def pretty_react_flow_state(self, obj):
        return self._pretty_json(obj.react_flow_state)

    @admin.display(description="Lexical State")
    def pretty_lexical_state(self, obj):
        return self._pretty_json(obj.lexical_state)

    def _pretty_json(self, value):
        try:
            formatted = json.dumps(value, indent=2)
            return format_html(
                '<pre style="font-size:11px;max-height:400px;overflow:auto;'
                'background:#f8f8f8;padding:8px;border-radius:4px;">{}</pre>',
                formatted,
            )
        except Exception:
            return str(value)


# ============================================================================
# STYLE TEMPLATE
# ============================================================================


@admin.register(StyleTemplate)
class StyleTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "is_global",
        "is_featured",
        "feature_rank",
        "required_fields_display",
        "updated_at",
    )
    list_filter = ("is_global", "is_featured", "owner")
    search_fields = ("name", "description", "owner__username")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "pretty_visual_styles",
        "pretty_text_content",
    )

    fieldsets = (
        (
            "Basic",
            {
                "fields": (
                    "id",
                    "name",
                    "description",
                    "owner",
                    "is_global",
                    "is_featured",
                    "feature_rank",
                )
            },
        ),
        ("Fields", {"fields": ("required_fields",)}),
        ("Dimensions", {"fields": ("dimensions",)}),
        ("Visual Styles", {"fields": ("pretty_visual_styles",)}),
        ("Text Content (Lexical)", {"fields": ("pretty_text_content",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="Required Fields")
    def required_fields_display(self, obj):
        fields = obj.required_fields or []
        if not fields:
            return mark_safe('<span style="color:#999;">—</span>')
        badges = "".join(
            f'<code style="background:#eef;padding:1px 5px;border-radius:3px;'
            f'margin-right:3px;font-size:11px;">{f}</code>'
            for f in fields
        )
        return mark_safe(badges)

    @admin.display(description="Visual Styles")
    def pretty_visual_styles(self, obj):
        return self._pretty_json(obj.visual_styles)

    @admin.display(description="Text Content")
    def pretty_text_content(self, obj):
        return self._pretty_json(obj.text_content)

    def _pretty_json(self, value):
        try:
            formatted = json.dumps(value, indent=2)
            return format_html(
                '<pre style="font-size:11px;max-height:400px;overflow:auto;'
                'background:#f8f8f8;padding:8px;border-radius:4px;">{}</pre>',
                formatted,
            )
        except Exception:
            return str(value)


# ============================================================================
# GROUP TEMPLATE
# ============================================================================


@admin.register(GroupTemplate)
class GroupTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "is_global",
        "is_featured",
        "child_direction",
        "updated_at",
    )
    list_filter = ("is_global", "is_featured", "owner", "child_direction")
    search_fields = ("name", "description", "owner__username")
    readonly_fields = ("id", "created_at", "updated_at")

    fieldsets = (
        (
            "Basic",
            {
                "fields": (
                    "id",
                    "name",
                    "description",
                    "owner",
                    "is_global",
                    "is_featured",
                    "feature_rank",
                )
            },
        ),
        (
            "Visual",
            {
                "fields": (
                    "background_color",
                    "background_opacity",
                    "border_color",
                    "border_width",
                    "border_style",
                    "border_radius",
                )
            },
        ),
        ("Padding", {"fields": ("padding_top", "padding_x", "padding_bottom")}),
        ("Label", {"fields": ("label_font_size", "label_color", "text_content")}),
        (
            "Child Layout",
            {
                "fields": (
                    "child_columns",
                    "child_gap_x",
                    "child_gap_y",
                    "child_direction",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


# ============================================================================
# GENERATION TEMPLATE
# ============================================================================


@admin.register(GenerationTemplate)
class GenerationTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "is_global",
        "is_featured",
        "feature_rank",
        "root_model",
        "updated_at",
    )
    list_filter = ("is_global", "is_featured", "owner", "root_model")
    search_fields = ("name", "description", "root_model", "owner__username")
    readonly_fields = ("id", "created_at", "updated_at", "pretty_steps")

    fieldsets = (
        (
            "Basic",
            {
                "fields": (
                    "id",
                    "name",
                    "description",
                    "owner",
                    "is_global",
                    "is_featured",
                    "feature_rank",
                )
            },
        ),
        ("Configuration", {"fields": ("root_model",)}),
        ("Steps", {"fields": ("pretty_steps",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="Steps")
    def pretty_steps(self, obj):
        try:
            formatted = json.dumps(obj.steps, indent=2)
            return format_html(
                '<pre style="font-size:11px;max-height:500px;overflow:auto;'
                'background:#f8f8f8;padding:8px;border-radius:4px;">{}</pre>',
                formatted,
            )
        except Exception:
            return str(obj.steps)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Auto-create a draft_version if none exists (mirrors API create behaviour)
        if not obj.draft_version_id:
            next_version = (
                GenerationTemplateVersion.objects.filter(template=obj)
                .order_by("-version_number")
                .values_list("version_number", flat=True)
                .first()
                or 0
            ) + 1
            version = GenerationTemplateVersion.objects.create(
                template=obj,
                version_number=next_version,
                root_model=obj.root_model,
                definition=obj.steps,
                layout_settings=obj.layout_settings,
                created_by=request.user,
            )
            GenerationTemplate.objects.filter(pk=obj.pk).update(draft_version=version)


@admin.register(TourDefinition)
class TourDefinitionAdmin(admin.ModelAdmin):
    list_display = ("key", "version", "is_active", "updated_at")
    list_filter = ("key", "is_active")
    search_fields = ("key",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(TourProgress)
class TourProgressAdmin(admin.ModelAdmin):
    list_display = (
        "tour",
        "user",
        "status",
        "current_step",
        "highest_step",
        "updated_at",
    )
    list_filter = ("status", "tour__key")
    search_fields = ("user__username", "tour__key")
    readonly_fields = ("started_at", "completed_at", "created_at", "updated_at")


@admin.register(SchemaVizUserPreference)
class SchemaVizUserPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "locale", "updated_at")
    list_filter = ("locale",)
    search_fields = ("user__username", "user__email")
    readonly_fields = ("created_at", "updated_at")
