from django.db import models
from django.db.models.functions import Lower
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
import uuid
import re
import json
from typing import ClassVar

User = get_user_model()


class RevisionedModel(models.Model):
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self._state.adding:
            if not self.revision:
                self.revision = 1
        else:
            self.revision = (self.revision or 0) + 1
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                normalized_update_fields = set(update_fields)
                normalized_update_fields.add("revision")
                kwargs["update_fields"] = list(normalized_update_fields)

        super().save(*args, **kwargs)


# ============================================================================
# DRAWING
# ============================================================================


class DrawingManager(models.Manager):
    def for_user(self, user):
        return self.get_queryset().filter(owner=user)


class Drawing(RevisionedModel):
    objects: ClassVar[DrawingManager] = DrawingManager()

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # React Flow nodes/edges/viewport serialized as-is
    react_flow_state = models.JSONField(default=dict)
    # Map of node_id -> Lexical editor state
    lexical_state = models.JSONField(default=dict, blank=True)

    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="drawings", null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


# ============================================================================
# STYLE TEMPLATES
# ============================================================================


class StyleTemplateManager(models.Manager):
    def global_templates(self):
        return self.get_queryset().filter(is_global=True)

    def user_templates(self, user):
        return self.get_queryset().filter(owner=user, is_global=False)

    def accessible_by_user(self, user):
        if user.is_authenticated:
            return self.get_queryset().filter(
                models.Q(is_global=True) | models.Q(owner=user)
            )
        return self.global_templates()


class StyleTemplate(RevisionedModel):
    """
    A reusable node style defined by the user. Contains visual styling,
    a Lexical text template, and the list of model fields it requires
    (derived from {{field}} placeholders in the Lexical content).
    """

    objects: ClassVar[StyleTemplateManager] = StyleTemplateManager()

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Visual appearance
    visual_styles = models.JSONField(
        default=dict,
        help_text="CSS properties: colors, borders, backgrounds, etc.",
    )
    dimensions = models.JSONField(
        default=dict,
        help_text="Default width and height of the node",
    )
    type_specific_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Node-type specific data such as shape and shape colors.",
    )

    # Lexical editor template - may contain {{field}} placeholders
    text_content = models.JSONField(
        null=True,
        blank=True,
        help_text="Lexical editor state, may reference model fields via {{field_name}}",
    )

    # Fields required to apply this template (parsed from text_content placeholders)
    required_fields = models.JSONField(
        default=list,
        blank=True,
        help_text="List of model field names this template needs, e.g. ['hostname', 'ip_address']",
    )
    target_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        related_name="style_templates_targeted",
        null=True,
        blank=True,
        help_text="Optional forced model target when exclusive mode is enabled.",
    )
    is_model_exclusive = models.BooleanField(
        default=False,
        help_text="When enabled, this template can only be applied to the selected target model.",
    )

    # Scope
    is_global = models.BooleanField(
        default=False,
        help_text="Global templates are available to all users",
    )
    is_featured = models.BooleanField(
        default=False,
        help_text="Featured templates are highlighted as recommended company defaults.",
    )
    feature_rank = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional manual ordering for featured templates. Lower ranks appear first.",
    )
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="style_templates",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "owner",
                condition=models.Q(is_global=False),
                name="uniq_style_template_name_owner_ci",
            ),
            models.UniqueConstraint(
                Lower("name"),
                condition=models.Q(is_global=True),
                name="uniq_style_template_name_global_ci",
            ),
        ]
        indexes = [
            models.Index(fields=["is_global", "owner"]),
            models.Index(fields=["is_featured", "feature_rank"]),
        ]

    def __str__(self):
        scope = "Global" if self.is_global else f"User ({self.owner})"
        return f"{self.name} ({scope})"

    @property
    def target_model_class(self):
        if self.target_content_type is None:
            return None
        return self.target_content_type.model_class()

    @property
    def target_model_ref(self) -> str | None:
        if self.target_model_status != "ok" or self.target_content_type is None:
            return None
        return f"{self.target_content_type.app_label}.{self.target_content_type.model}"

    @property
    def target_model_status(self) -> str:
        if self.target_content_type is None:
            return "missing"
        return "ok" if self.target_content_type.model_class() is not None else "stale"

    def save(self, *args, **kwargs):
        self.required_fields = self._parse_required_fields()
        super().save(*args, **kwargs)

    def _parse_required_fields(self) -> list[str]:
        if not self.text_content:
            return []
        try:
            normalized_content = self.text_content
            if isinstance(normalized_content, str):
                normalized_content = json.loads(normalized_content)
            root = normalized_content.get("root", normalized_content)
            seen = dict.fromkeys(self._collect_paths(root))
            return list(seen)
        except Exception:
            return []

    def _collect_paths(self, node: dict) -> list[str]:
        """Recursively walk the Lexical JSON tree, collecting data-reference paths."""
        results = []
        if node.get("type") == "data-reference" and "path" in node:
            results.append(node["path"])

        # Raw mode stores placeholders inside text nodes. Keep required_fields accurate there too.
        if node.get("type") == "text":
            text_value = node.get("text", "")
            if isinstance(text_value, str):
                matches = re.findall(r"\{\{([^{}]+)\}\}", text_value)
                results.extend(match.strip() for match in matches if match.strip())

        for child in node.get("children", []):
            results.extend(self._collect_paths(child))
        return results


class ModelTemplateDefaultQuerySet(models.QuerySet):
    def for_user(self, user):
        if user is None or not getattr(user, "is_authenticated", False):
            return self.none()
        return self.filter(owner=user)

    def for_content_type(self, content_type):
        if content_type is None:
            return self.none()
        return self.filter(content_type=content_type)

    def resolve_for_content_type(self, user, content_type):
        return (
            self.for_user(user)
            .for_content_type(content_type)
            .select_related(
                "content_type",
                "style_template",
                "style_template__target_content_type",
            )
            .first()
        )

    def resolve_for_model_ref(self, user, model_ref: str | None):
        from .utils.style_template_compatibility import (
            resolve_content_type_for_model_ref,
        )

        return self.resolve_for_content_type(
            user,
            resolve_content_type_for_model_ref(model_ref),
        )


class ModelTemplateDefaultManager(
    models.Manager.from_queryset(ModelTemplateDefaultQuerySet)
):
    pass


class ModelTemplateDefault(models.Model):
    objects: ClassVar[ModelTemplateDefaultManager] = ModelTemplateDefaultManager()

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="model_template_defaults",
    )
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="model_template_defaults",
    )
    style_template = models.ForeignKey(
        StyleTemplate,
        on_delete=models.CASCADE,
        related_name="model_defaults",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "content_type"],
                name="uniq_model_template_default_owner_content_type",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "content_type"]),
        ]

    def __str__(self):
        return f"{self.owner} -> {self.model_ref or 'stale-model'} -> {self.style_template}"

    @property
    def model_class(self):
        return self.content_type.model_class()

    @property
    def model_ref(self) -> str | None:
        if self.model_status != "ok":
            return None
        return f"{self.content_type.app_label}.{self.content_type.model}"

    @property
    def model_status(self) -> str:
        return "ok" if self.content_type.model_class() is not None else "stale"


# ============================================================================
# GROUP TEMPLATES
# ============================================================================


class GroupTemplateManager(models.Manager):
    def global_templates(self):
        return self.get_queryset().filter(is_global=True)

    def user_templates(self, user):
        return self.get_queryset().filter(owner=user, is_global=False)

    def accessible_by_user(self, user):
        if user.is_authenticated:
            return self.get_queryset().filter(
                models.Q(is_global=True) | models.Q(owner=user)
            )
        return self.global_templates()


class GroupTemplate(RevisionedModel):
    """
    A reusable template for group nodes. Defines visual appearance, internal
    padding, label styling, and child layout configuration.
    """

    objects: ClassVar[GroupTemplateManager] = GroupTemplateManager()

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Visual appearance
    background_color = models.CharField(
        max_length=50,
        default="rgba(255, 255, 255, 0.1)",
        help_text="Background color of the group container.",
    )
    background_opacity = models.FloatField(
        default=1.0, help_text="Opacity multiplier for the background (0.0 - 1.0)."
    )
    border_color = models.CharField(
        max_length=50,
        default="rgba(23, 18, 20, 0.14)",
        help_text="Border color of the group.",
    )
    border_width = models.FloatField(default=1.0, help_text="Border width in px.")
    border_style = models.CharField(
        max_length=20,
        default="solid",
        help_text="CSS border-style: solid, dashed, dotted, etc.",
    )
    border_radius = models.PositiveIntegerField(
        default=10, help_text="Border radius in px."
    )

    # Internal padding (distance from group border to child content area)
    padding_top = models.PositiveIntegerField(
        default=48, help_text="Top padding in px (includes label area)."
    )
    padding_x = models.PositiveIntegerField(
        default=16, help_text="Horizontal padding (left and right) in px."
    )
    padding_bottom = models.PositiveIntegerField(
        default=16, help_text="Bottom padding in px."
    )

    # Label styling
    label_font_size = models.PositiveIntegerField(
        default=14, help_text="Font size of the group label in px."
    )
    label_color = models.CharField(
        max_length=50,
        default="rgba(23, 18, 20, 0.82)",
        help_text="Text color of the group label.",
    )
    text_content = models.JSONField(
        null=True,
        blank=True,
        help_text="Optional Lexical editor state for the group label text.",
    )

    # Child layout
    child_columns = models.PositiveIntegerField(
        default=3, help_text="Number of columns for the child grid layout."
    )
    child_gap_x = models.PositiveIntegerField(
        default=16, help_text="Horizontal gap between children in px."
    )
    child_gap_y = models.PositiveIntegerField(
        default=20, help_text="Vertical gap between children in px."
    )
    child_direction = models.CharField(
        max_length=20,
        default="grid",
        help_text="Layout direction for children: grid, horizontal, or vertical.",
    )

    # Scope
    is_global = models.BooleanField(
        default=False, help_text="Global templates are available to all users."
    )
    is_featured = models.BooleanField(
        default=False,
        help_text="Featured templates are highlighted as recommended company defaults.",
    )
    feature_rank = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional ordering for featured templates. Lower ranks appear first.",
    )
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="group_templates",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "owner",
                condition=models.Q(is_global=False),
                name="uniq_group_template_name_owner_ci",
            ),
            models.UniqueConstraint(
                Lower("name"),
                condition=models.Q(is_global=True),
                name="uniq_group_template_name_global_ci",
            ),
        ]
        indexes = [
            models.Index(fields=["is_global", "owner"]),
            models.Index(fields=["is_featured", "feature_rank"]),
        ]

    def __str__(self):
        scope = "Global" if self.is_global else f"User ({self.owner})"
        return f"{self.name} ({scope})"


# ============================================================================
# GENERATION TEMPLATES
# ============================================================================


class GenerationTemplateManager(models.Manager):
    def global_templates(self):
        return self.get_queryset().filter(is_global=True)

    def user_templates(self, user):
        return self.get_queryset().filter(owner=user, is_global=False)

    def accessible_by_user(self, user):
        if user.is_authenticated:
            return self.get_queryset().filter(
                models.Q(is_global=True) | models.Q(owner=user)
            )
        return self.global_templates()


class GenerationTemplate(RevisionedModel):
    """
    A reusable recipe for generating diagrams from live data.

    Defines a traversal tree starting from a root model: which relationships
    to follow, which nodes are visible, and which StyleTemplate to apply
    at each step. Hidden nodes act as waypoints — their visible descendants
    connect back to the nearest visible ancestor.

    Step schema (JSON tree):
    {
        "visible": true,
        "asGroup": false,
        "breakOutOfGroup": false,
        "styleTemplateId": "uuid-or-null",
        "label": "optional display name",
        "children": [
            {
                "relationship": "subnet",
                "visible": false,
                "asGroup": false,
                "breakOutOfGroup": false,
                "styleTemplateId": null,
                "label": null,
                "children": [
                    {
                        "relationship": "network",
                        "visible": true,
                        "asGroup": true,
                        "breakOutOfGroup": false,
                        "styleTemplateId": "uuid",
                        "label": "VPC",
                        "children": []
                    }
                ]
            }
        ]
    }
    """

    objects: ClassVar[GenerationTemplateManager] = GenerationTemplateManager()

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Entry point — stored as "app_label.ModelName" e.g. "infrastructure.Server"
    root_model = models.CharField(
        max_length=200,
        help_text='The starting model for traversal, e.g. "infrastructure.Server"',
    )
    export_name = models.SlugField(
        max_length=120,
        null=True,
        blank=True,
        help_text="Unique slug used in export URLs, e.g. export/schema_viz/my-template",
    )

    # Traversal recipe — JSON tree of steps
    steps = models.JSONField(
        default=dict,
        help_text="Tree of traversal steps defining relationships, visibility, and style templates",
    )
    layout_settings = models.JSONField(
        default=dict,
        blank=True,
        help_text='Layout preferences, e.g. {"algorithm": "horizontal", "spacing": 40}',
    )
    # Scope
    is_global = models.BooleanField(
        default=False,
        help_text="Global templates are available to all users",
    )
    is_featured = models.BooleanField(
        default=False,
        help_text="Featured templates appear as quick access recommendations on the start page.",
    )
    feature_rank = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional manual ordering for featured templates. Lower ranks appear first.",
    )
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="generation_templates",
        null=True,
        blank=True,
    )
    draft_version = models.ForeignKey(
        "GenerationTemplateVersion",
        on_delete=models.SET_NULL,
        related_name="draft_for_templates",
        null=True,
        blank=True,
    )
    published_version = models.ForeignKey(
        "GenerationTemplateVersion",
        on_delete=models.SET_NULL,
        related_name="published_for_templates",
        null=True,
        blank=True,
    )
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="published_generation_templates",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "owner",
                condition=models.Q(is_global=False),
                name="uniq_generation_template_name_owner_ci",
            ),
            models.UniqueConstraint(
                Lower("name"),
                condition=models.Q(is_global=True),
                name="uniq_generation_template_name_global_ci",
            ),
            models.UniqueConstraint(
                Lower("export_name"),
                condition=models.Q(export_name__isnull=False),
                name="uniq_generation_template_export_name_ci",
            ),
        ]
        indexes = [
            models.Index(fields=["is_global", "owner"]),
            models.Index(fields=["is_featured", "feature_rank"]),
            models.Index(fields=["root_model"]),
        ]

    def __str__(self):
        scope = "Global" if self.is_global else f"User ({self.owner})"
        return f"{self.name} — {self.root_model} ({scope})"


class GenerationTemplateVersion(models.Model):
    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    template = models.ForeignKey(
        GenerationTemplate,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    root_model = models.CharField(
        max_length=200,
        help_text='The starting model for traversal, e.g. "infrastructure.Server"',
    )
    definition = models.JSONField(
        default=dict,
        help_text="Normalized generation graph definition keyed by step id.",
    )
    layout_settings = models.JSONField(
        default=dict,
        blank=True,
        help_text='Layout preferences, e.g. {"algorithm": "horizontal", "spacing": 40}',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="generation_template_versions",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_number", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["template", "version_number"],
                name="uniq_generation_template_version_number",
            ),
        ]
        indexes = [
            models.Index(fields=["template", "-version_number"]),
            models.Index(fields=["root_model"]),
        ]

    def __str__(self):
        return f"{self.template.name} v{self.version_number}"


class SchemaVizUserPreference(models.Model):
    LOCALE_DE = "de"
    LOCALE_EN = "en"
    LOCALE_CHOICES = (
        (LOCALE_DE, "Deutsch"),
        (LOCALE_EN, "English"),
    )

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="schema_viz_preference",
    )
    locale = models.CharField(
        max_length=8,
        choices=LOCALE_CHOICES,
        default=LOCALE_EN,
    )
    help_hints_enabled = models.BooleanField(default=True)
    help_hints_dismissed = models.JSONField(default=dict, blank=True)
    ai_api_key_enc = models.TextField(blank=True, default="")
    ai_base_url = models.CharField(max_length=500, blank=True, default="")
    ai_model = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user_id"]

    def __str__(self):
        return f"{self.user} — {self.locale}"

    @property
    def ai_api_key(self) -> str:
        """Decrypt and return the stored API key (empty string if unset)."""
        if not self.ai_api_key_enc:
            return ""
        from .utils.encryption import decrypt_value

        return decrypt_value(self.ai_api_key_enc) or ""

    @ai_api_key.setter
    def ai_api_key(self, plaintext: str):
        """Encrypt and store the API key."""
        if not plaintext:
            self.ai_api_key_enc = ""
        else:
            from .utils.encryption import encrypt_value

            self.ai_api_key_enc = encrypt_value(plaintext)

    @property
    def has_ai_key(self) -> bool:
        return bool(self.ai_api_key_enc)


# ============================================================================
# TEMPLATE FAVORITES
# ============================================================================


class StyleTemplateFavorite(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="style_template_favorites",
    )
    style_template = models.ForeignKey(
        StyleTemplate,
        on_delete=models.CASCADE,
        related_name="favorite_entries",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "style_template"],
                name="uniq_style_template_favorite_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} -> {self.style_template}"


class GenerationTemplateFavorite(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="generation_template_favorites",
    )
    generation_template = models.ForeignKey(
        GenerationTemplate,
        on_delete=models.CASCADE,
        related_name="favorite_entries",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "generation_template"],
                name="uniq_generation_template_favorite_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} -> {self.generation_template}"


# ============================================================================
# TOURS
# ============================================================================


class TourDefinitionManager(models.Manager):
    def active(self):
        return self.get_queryset().filter(is_active=True)

    def active_for_key(self, key: str):
        return self.active().filter(key=key).order_by("-version")


class TourDefinition(models.Model):
    objects: ClassVar[TourDefinitionManager] = TourDefinitionManager()

    key = models.SlugField(max_length=120)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key", "-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["key", "version"],
                name="uniq_tour_definition_key_version",
            ),
        ]
        indexes = [
            models.Index(fields=["key", "is_active"]),
        ]

    def __str__(self):
        return f"{self.key} v{self.version}"


class TourProgressManager(models.Manager):
    def for_user(self, user):
        return self.get_queryset().filter(user=user)


class TourProgress(models.Model):
    STATUS_NOT_STARTED = "not_started"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = [
        (STATUS_NOT_STARTED, "Not Started"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
    ]

    objects: ClassVar[TourProgressManager] = TourProgressManager()

    tour = models.ForeignKey(
        TourDefinition,
        on_delete=models.CASCADE,
        related_name="progress_entries",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="tour_progress",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NOT_STARTED,
    )
    current_step = models.PositiveIntegerField(default=0)
    highest_step = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tour", "user"],
                name="uniq_tour_progress_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.tour} ({self.status})"
