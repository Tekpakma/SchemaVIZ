import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import Resolver404, resolve
from rest_framework.test import APITestCase

from django_schema_viz.tests.qlab_registry_helpers import (
    reset_qlab_registry,
    seed_qlab_registry,
    set_registry_entry,
)

User = get_user_model()

RECORDS_URL = "/schema-viz/query/records/"
RECORD_URL = "/schema-viz/query/record/"
METADATA_URL = "/schema-viz/query/metadata/"
NEIGHBORHOOD_URL = "/schema-viz/query/neighborhood/"
class QueryRecordsViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com"
        )
        self.bob = User.objects.create_user(username="bob", email="bob@example.com")
        self.charlie = User.objects.create_user(
            username="charlie", email="charlie@example.com"
        )

    def tearDown(self):
        reset_qlab_registry()

    def test_records_returns_paginated_shape(self):
        response = self.client.post(
            RECORDS_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "pageSize": 20,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("count", data)
        self.assertIn("page", data)
        self.assertIn("pageSize", data)
        self.assertIn("totalPages", data)
        self.assertIn("results", data)

    def test_records_return_fields_and_display_name(self):
        response = self.client.post(
            RECORDS_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        result = response.json()["results"][0]
        self.assertIn("fields", result)
        self.assertIn("displayName", result)
        self.assertIn("id", result["fields"])

    def test_records_support_nested_filter_logic(self):
        response = self.client.post(
            RECORDS_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "filterFields": {
                    "orOperation": [
                        {"field": "username", "op": "icontains", "value": "ali"},
                        {"field": "email", "op": "icontains", "value": "bob@example.com"},
                    ]
                },
                "pageSize": 20,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        usernames = {result["fields"]["username"] for result in response.json()["results"]}
        self.assertIn("alice", usernames)
        self.assertIn("bob", usernames)
        self.assertNotIn("charlie", usernames)

    def test_invalid_filter_field_returns_structured_error(self):
        response = self.client.post(
            RECORDS_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "filterFields": {
                    "andOperation": [
                        {"field": "does_not_exist", "op": "is", "value": "alice"}
                    ]
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("errors", data)
        self.assertTrue(any("does_not_exist" in err["msg"] for err in data["errors"]))

    def test_invalid_operation_returns_structured_error(self):
        response = self.client.post(
            RECORDS_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "filterFields": {
                    "andOperation": [
                        {"field": "username", "op": "gte", "value": "alice"}
                    ]
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("errors", data)
        self.assertTrue(any("not allowed" in err["msg"] for err in data["errors"]))

    def test_records_return_403_for_inaccessible_models(self):
        seed_qlab_registry(["auth.Group"], clear=True)
        response = self.client.post(
            RECORDS_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("error", response.json())

    def test_records_return_403_for_disabled_models(self):
        set_registry_entry("auth.user", status="disabled")

        response = self.client.post(
            RECORDS_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_records_allow_restricted_models_for_allowed_group(self):
        analysts = Group.objects.create(name="Analysts")
        self.alice.groups.add(analysts)
        set_registry_entry(
            "auth.user",
            status="enabled",
            is_restricted=True,
            allowed_groups=[analysts],
        )

        self.client.force_authenticate(self.alice)
        response = self.client.post(
            RECORDS_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)


class QueryRecordViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.user = User.objects.create_user(
            username="alice", email="alice@example.com"
        )

    def tearDown(self):
        reset_qlab_registry()

    def test_record_returns_full_payload_by_default(self):
        response = self.client.post(
            RECORD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "id": str(self.user.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["fields"]["username"], "alice")
        self.assertIn("id", data["fields"])
        self.assertIn("displayName", data)

    def test_record_respects_select_fields_and_keeps_id(self):
        response = self.client.post(
            RECORD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "id": str(self.user.pk),
                "selectFields": ["username"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()["fields"]
        self.assertEqual(set(data.keys()), {"id", "username"})
        self.assertEqual(data["username"], "alice")

    def test_record_returns_404_for_missing_pk(self):
        response = self.client.post(
            RECORD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "id": "999999",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_record_returns_403_for_submitted_models(self):
        set_registry_entry("auth.user", status="submitted")

        response = self.client.post(
            RECORD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "id": str(self.user.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class QueryMetadataViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()

    def tearDown(self):
        reset_qlab_registry()

    def test_metadata_returns_lookup_information(self):
        response = self.client.post(
            METADATA_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["primaryKeyField"], "id")
        self.assertIn("fields", data)
        self.assertIn("allLookups", data)
        username_field = next(
            field for field in data["fields"] if field["name"] == "username"
        )
        self.assertIn("allowedOperations", username_field)

    def test_metadata_returns_403_for_inaccessible_models(self):
        seed_qlab_registry(["auth.Group"], clear=True)
        response = self.client.post(
            METADATA_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_metadata_returns_403_for_unauthorized_groups(self):
        set_registry_entry(
            "auth.user",
            status="enabled",
            is_restricted=True,
        )

        response = self.client.post(
            METADATA_URL,
            {"appLabel": "auth", "modelName": "user"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class QueryNeighborhoodViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com"
        )

    def tearDown(self):
        reset_qlab_registry()

    def test_neighborhood_returns_relation_pks_per_record(self):
        response = self.client.post(
            NEIGHBORHOOD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "nodePks": [str(self.alice.pk), str(self.bob.pk)],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["model"], "auth.user")
        self.assertEqual(len(data["records"]), 2)
        first_record = data["records"][0]
        self.assertIn("nodeId", first_record)
        self.assertIn("relations", first_record)
        self.assertIn("groups", first_record["relations"])
        self.assertIn("filterName", first_record["relations"]["groups"])
        self.assertIn("pks", first_record["relations"]["groups"])
        self.assertIn("count", first_record["relations"]["groups"])
        self.assertEqual(
            first_record["relations"]["groups"]["count"],
            len(first_record["relations"]["groups"]["pks"]),
        )

    def test_neighborhood_returns_403_for_inaccessible_models(self):
        seed_qlab_registry(["auth.Group"], clear=True)
        response = self.client.post(
            NEIGHBORHOOD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "nodePks": ["1"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_neighborhood_returns_403_for_disabled_models(self):
        set_registry_entry("auth.user", status="disabled")

        response = self.client.post(
            NEIGHBORHOOD_URL,
            {
                "appLabel": "auth",
                "modelName": "user",
                "nodePks": ["1"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class QueryRouteRemovalTests(APITestCase):
    def test_legacy_get_routes_are_unresolved(self):
        with self.assertRaises(Resolver404):
            resolve("/schema-viz/query/auth/user/")

        with self.assertRaises(Resolver404):
            resolve("/schema-viz/query/auth/user/1/")

    def test_openapi_schema_only_contains_post_query_endpoints(self):
        response = self.client.get(
            "/api/schema/",
            HTTP_ACCEPT="application/vnd.oai.openapi+json",
        )
        self.assertEqual(response.status_code, 200)

        schema = json.loads(response.content)
        paths = schema["paths"]

        self.assertIn("/schema-viz/template-uniqueness/", paths)
        self.assertIn("/schema-viz/query/records/", paths)
        self.assertIn("/schema-viz/query/record/", paths)
        self.assertIn("/schema-viz/query/metadata/", paths)
        self.assertIn("/schema-viz/query/neighborhood/", paths)
        self.assertNotIn("/schema-viz/query/{appLabel}/{modelName}/", paths)
        self.assertNotIn("/schema-viz/query/{appLabel}/{modelName}/{id}/", paths)
