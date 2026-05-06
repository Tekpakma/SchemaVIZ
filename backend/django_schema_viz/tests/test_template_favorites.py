from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.models import (
    GenerationTemplate,
    GenerationTemplateFavorite,
    StyleTemplate,
    StyleTemplateFavorite,
)
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()

TEMPLATE_FAVORITES_URL = "/schema-viz/template-favorites/"


class TemplateFavoritesViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="owner",
            email="owner@example.com",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
        )
        self.client.force_authenticate(self.user)

        self.style_template = StyleTemplate.objects.create(
            name="Server Card",
            owner=self.user,
            is_global=False,
            visual_styles={},
            dimensions={},
            text_content=None,
        )
        self.global_style_template = StyleTemplate.objects.create(
            name="Global Card",
            owner=self.other_user,
            is_global=True,
            visual_styles={},
            dimensions={},
            text_content=None,
        )
        self.other_private_style_template = StyleTemplate.objects.create(
            name="Other Private Card",
            owner=self.other_user,
            is_global=False,
            visual_styles={},
            dimensions={},
            text_content=None,
        )

        self.generation_template = GenerationTemplate.objects.create(
            name="Network Overview",
            owner=self.user,
            is_global=False,
            root_model="auth.User",
            steps={"visible": True, "children": []},
        )
        self.global_generation_template = GenerationTemplate.objects.create(
            name="Global Overview",
            owner=self.other_user,
            is_global=True,
            root_model="auth.User",
            steps={"visible": True, "children": []},
        )
        self.other_private_generation_template = GenerationTemplate.objects.create(
            name="Other Private Overview",
            owner=self.other_user,
            is_global=False,
            root_model="auth.User",
            steps={"visible": True, "children": []},
        )

    def test_get_returns_current_favorite_ids(self):
        StyleTemplateFavorite.objects.create(
            user=self.user,
            style_template=self.global_style_template,
        )
        GenerationTemplateFavorite.objects.create(
            user=self.user,
            generation_template=self.generation_template,
        )

        response = self.client.get(TEMPLATE_FAVORITES_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "styleTemplateIds": [str(self.global_style_template.id)],
                "generationTemplateIds": [str(self.generation_template.id)],
            },
        )

    def test_put_replaces_favorites_and_ignores_inaccessible_templates(self):
        response = self.client.put(
            TEMPLATE_FAVORITES_URL,
            {
                "styleTemplateIds": [
                    str(self.style_template.id),
                    str(self.global_style_template.id),
                    str(self.other_private_style_template.id),
                ],
                "generationTemplateIds": [
                    str(self.generation_template.id),
                    str(self.global_generation_template.id),
                    str(self.other_private_generation_template.id),
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "styleTemplateIds": [
                    str(self.style_template.id),
                    str(self.global_style_template.id),
                ],
                "generationTemplateIds": [
                    str(self.generation_template.id),
                    str(self.global_generation_template.id),
                ],
            },
        )

        self.assertEqual(
            list(
                StyleTemplateFavorite.objects.filter(user=self.user)
                .values_list("style_template_id", flat=True)
                .order_by("created_at")
            ),
            [self.style_template.id, self.global_style_template.id],
        )
        self.assertEqual(
            list(
                GenerationTemplateFavorite.objects.filter(user=self.user)
                .values_list("generation_template_id", flat=True)
                .order_by("created_at")
            ),
            [self.generation_template.id, self.global_generation_template.id],
        )

    def test_deleted_templates_disappear_from_favorites(self):
        StyleTemplateFavorite.objects.create(
            user=self.user,
            style_template=self.style_template,
        )
        GenerationTemplateFavorite.objects.create(
            user=self.user,
            generation_template=self.generation_template,
        )

        self.style_template.delete()
        self.generation_template.delete()

        response = self.client.get(TEMPLATE_FAVORITES_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "styleTemplateIds": [],
                "generationTemplateIds": [],
            },
        )
