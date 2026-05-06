from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from django_schema_viz.models import Drawing, GenerationTemplate, StyleTemplate
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

User = get_user_model()

PAGINATED_REST_FRAMEWORK = {
    **getattr(settings, "REST_FRAMEWORK", {}),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 1,
}


@override_settings(REST_FRAMEWORK=PAGINATED_REST_FRAMEWORK)
class NonPaginatedListEndpointsTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(username="owner", email="owner@example.com")
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
        )
        self.client.force_authenticate(self.user)

        self.drawing = Drawing.objects.create(
            title="Owner drawing",
            description="",
            react_flow_state={"nodes": [], "edges": []},
            lexical_state={},
            owner=self.user,
        )
        Drawing.objects.create(
            title="Other drawing",
            description="",
            react_flow_state={"nodes": [], "edges": []},
            lexical_state={},
            owner=self.other_user,
        )

        self.style_template = StyleTemplate.objects.create(
            name="Owner style template",
            owner=self.user,
        )
        StyleTemplate.objects.create(
            name="Other style template",
            owner=self.other_user,
        )

        self.generation_template = GenerationTemplate.objects.create(
            name="Owner generation template",
            root_model="auth.User",
            steps={"visible": True, "children": []},
            owner=self.user,
        )
        GenerationTemplate.objects.create(
            name="Other generation template",
            root_model="auth.User",
            steps={"visible": True, "children": []},
            owner=self.other_user,
        )

    def test_drawings_list_returns_plain_array_with_global_pagination_enabled(self):
        response = self.client.get("/schema-viz/drawings/")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertIsInstance(payload, list)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], str(self.drawing.id))

    def test_style_templates_list_returns_plain_array_with_global_pagination_enabled(self):
        response = self.client.get("/schema-viz/templates/")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertIsInstance(payload, list)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], str(self.style_template.id))

    def test_generation_templates_list_returns_plain_array_with_global_pagination_enabled(self):
        response = self.client.get("/schema-viz/generation-templates/")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertIsInstance(payload, list)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], str(self.generation_template.id))
