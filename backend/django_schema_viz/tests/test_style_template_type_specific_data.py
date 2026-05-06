from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from django_schema_viz.models import StyleTemplate

User = get_user_model()

LIST_URL = "/schema-viz/templates/"


class StyleTemplateTypeSpecificDataTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="shape-owner",
            email="shape-owner@example.com",
        )
        self.client.force_authenticate(self.user)

    def test_create_persists_type_specific_data(self):
        response = self.client.post(
            LIST_URL,
            {
                "name": "Cloud Template",
                "description": "Shape-aware template",
                "typeSpecificData": {
                    "shape": "cloud",
                    "color": "#ff9900",
                    "borderColor": "#cc7a00",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(
            payload["typeSpecificData"],
            {
                "shape": "cloud",
                "color": "#ff9900",
                "borderColor": "#cc7a00",
            },
        )

        template = StyleTemplate.objects.get(pk=payload["id"])
        self.assertEqual(
            template.type_specific_data,
            {
                "shape": "cloud",
                "color": "#ff9900",
                "border_color": "#cc7a00",
            },
        )

    def test_list_returns_saved_type_specific_data(self):
        template = StyleTemplate.objects.create(
            name="Base Node",
            owner=self.user,
            type_specific_data={"shape": "default"},
        )

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], str(template.id))
        self.assertEqual(payload[0]["typeSpecificData"], {"shape": "default"})
