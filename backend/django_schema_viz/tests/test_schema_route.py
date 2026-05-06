from unittest.mock import patch

from django.contrib.auth import get_user_model

from rest_framework import status
from rest_framework.test import APITestCase

from django_schema_viz.utils.schema_discovery import (
    SchemaDiscoveryService,
    SchemaEdge,
    SchemaGraph,
    SchemaGroup,
    SchemaNode,
)


User = get_user_model()


class SchemaRouteViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="route-user",
            email="route@example.com",
        )
        self.client.force_authenticate(self.user)

    @patch("django_schema_viz.views.SchemaDiscoveryService.find_paths", return_value=[])
    @patch(
        "django_schema_viz.utils.schema_discovery.SchemaDiscoveryService.get_model_by_id"
    )
    def test_route_query_validation_receives_request_context(
        self,
        mock_get_model_by_id,
        mock_find_paths,
    ):
        def resolve_model(user, app_label, model_name):
            self.assertEqual(user.pk, self.user.pk)
            return f"{app_label}.{model_name}"

        mock_get_model_by_id.side_effect = resolve_model

        response = self.client.get(
            "/schema-viz/route/",
            {
                "startModel": "infrastructure.cloudprovider",
                "endModel": "infrastructure.region",
                "preferred": "infrastructure.subscription",
                "limit": 5,
                "maxDepth": 12,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(mock_get_model_by_id.call_count, 3)
        mock_find_paths.assert_called_once_with(
            user=self.user,
            start_model_id="infrastructure.cloudprovider",
            end_model_id="infrastructure.region",
            waypoints=[],
            preferred_models=["infrastructure.subscription"],
            excluded_models=[],
            k=5,
            max_depth=12,
        )


class SchemaDiscoveryServicePreferredModelsTests(APITestCase):
    def _build_graph(self):
        node_ids = [
            "app.Application",
            "app.FastLane",
            "app.Network",
            "app.AssignmentGroup",
            "app.Server",
            "app.Stack",
            "app.BusinessGroup",
            "app.Service",
            "app.Subscription",
        ]
        nodes = tuple(
            SchemaNode(
                id=node_id,
                name=node_id.split(".")[-1],
                group="app",
                is_proxy=False,
                is_abstract=False,
                primary_key="id",
                app_label="app",
                model_name=node_id.split(".")[-1].lower(),
                fields=frozenset(),
            )
            for node_id in node_ids
        )
        edges = (
            SchemaEdge("app.Application", "app.FastLane", source_field="fast_lane"),
            SchemaEdge("app.FastLane", "app.Network", source_field="network"),
            SchemaEdge(
                "app.Application",
                "app.AssignmentGroup",
                source_field="assignment_group",
            ),
            SchemaEdge("app.AssignmentGroup", "app.Server", source_field="server"),
            SchemaEdge("app.Server", "app.Stack", source_field="stack"),
            SchemaEdge("app.Stack", "app.Network", source_field="network"),
            SchemaEdge(
                "app.Application",
                "app.BusinessGroup",
                source_field="business_group",
            ),
            SchemaEdge("app.BusinessGroup", "app.Service", source_field="service"),
            SchemaEdge("app.Service", "app.Server", source_field="server"),
            SchemaEdge(
                "app.Server",
                "app.Subscription",
                source_field="subscription",
            ),
            SchemaEdge("app.Subscription", "app.Network", source_field="network"),
        )
        return SchemaGraph(
            schema_hash="test",
            nodes=nodes,
            edges=edges,
            groups=(SchemaGroup(id="app", name="app"),),
        )

    def test_model_ids_use_generation_compatible_app_model_format(self):
        self.assertEqual(SchemaDiscoveryService._get_model_id(User), "auth.User")

    @patch("django_schema_viz.utils.schema_discovery.SchemaDiscoveryService.get_schema")
    def test_find_paths_does_not_follow_hidden_reverse_relations(
        self,
        mock_get_schema,
    ):
        nodes = tuple(
            SchemaNode(
                id=node_id,
                name=node_id.split(".")[-1],
                group="app",
                is_proxy=False,
                is_abstract=False,
                primary_key="id",
                app_label="app",
                model_name=node_id.split(".")[-1].lower(),
                fields=frozenset(),
            )
            for node_id in ["app.DeltaLink", "app.AlphaHub"]
        )
        mock_get_schema.return_value = SchemaGraph(
            schema_hash="test",
            nodes=nodes,
            edges=(
                SchemaEdge(
                    "app.DeltaLink",
                    "app.AlphaHub",
                    source_field="alpha_hub",
                    reverse_name="+",
                    is_foreign_key=True,
                ),
            ),
            groups=(SchemaGroup(id="app", name="app"),),
        )

        reverse_paths = SchemaDiscoveryService.find_paths(
            user=None,
            start_model_id="app.AlphaHub",
            end_model_id="app.DeltaLink",
            k=1,
            max_depth=2,
        )
        forward_paths = SchemaDiscoveryService.find_paths(
            user=None,
            start_model_id="app.DeltaLink",
            end_model_id="app.AlphaHub",
            k=1,
            max_depth=2,
        )

        self.assertEqual(reverse_paths, [])
        self.assertEqual(len(forward_paths), 1)
        self.assertTrue(forward_paths[0].steps[0].is_forward)

    @patch("django_schema_viz.utils.schema_discovery.SchemaDiscoveryService.get_schema")
    def test_find_paths_prioritizes_preferred_models_without_hard_waypoints(
        self,
        mock_get_schema,
    ):
        mock_get_schema.return_value = self._build_graph()

        paths = SchemaDiscoveryService.find_paths(
            user=None,
            start_model_id="app.Application",
            end_model_id="app.Network",
            preferred_models=["app.Server"],
            excluded_models=[],
            k=2,
            max_depth=6,
        )

        rendered_paths = [
            [step.target_model_id for step in path.steps] for path in paths
        ]

        self.assertEqual(
            rendered_paths,
            [
                [
                    "app.AssignmentGroup",
                    "app.Server",
                    "app.Stack",
                    "app.Network",
                ],
                [
                    "app.BusinessGroup",
                    "app.Service",
                    "app.Server",
                    "app.Subscription",
                    "app.Network",
                ],
            ],
        )

    @patch("django_schema_viz.utils.schema_discovery.SchemaDiscoveryService.get_schema")
    def test_find_paths_with_waypoints_returns_only_waypoint_compliant_alternatives(
        self,
        mock_get_schema,
    ):
        mock_get_schema.return_value = self._build_graph()

        paths = SchemaDiscoveryService.find_paths(
            user=None,
            start_model_id="app.Application",
            end_model_id="app.Network",
            waypoints=["app.Server"],
            excluded_models=[],
            k=4,
            max_depth=6,
        )

        rendered_paths = [
            [step.target_model_id for step in path.steps] for path in paths
        ]

        self.assertGreaterEqual(len(rendered_paths), 4)
        self.assertTrue(all("app.Server" in path for path in rendered_paths))
        self.assertTrue(all(path.waypoints == ["app.Server"] for path in paths))
        self.assertIn(
            [
                "app.AssignmentGroup",
                "app.Server",
                "app.Stack",
                "app.Network",
            ],
            rendered_paths,
        )
        self.assertIn(
            [
                "app.BusinessGroup",
                "app.Service",
                "app.Server",
                "app.Subscription",
                "app.Network",
            ],
            rendered_paths,
        )
