import json
from io import BytesIO

from django.test import SimpleTestCase, override_settings

from django_schema_viz.drf import (
    QueryPagination,
    SCHEMA_VIZ_JSON_UNDERSCOREIZE,
    SchemaVizCamelCaseJSONParser,
    SchemaVizCamelCaseJSONRenderer,
    SchemaVizCamelCaseMultiPartParser,
)
from django_schema_viz.views import (
    AppsListView,
    DrawingImportView,
    DrawingViewSet,
    GenerationRunView,
    GenerationTemplateViewSet,
    ModelDetailView,
    ModelsListView,
    QueryListView,
    QueryRetrieveView,
    SchemaGraphView,
    SchemaRouteView,
    StyleTemplateViewSet,
    StatelessExportView,
    TourProgressListView,
    TourProgressView,
)


STANDARD_JSON_CAMEL_CASE_VIEW_CLASSES = [
    TourProgressView,
    TourProgressListView,
    StyleTemplateViewSet,
    SchemaGraphView,
    SchemaRouteView,
    ModelsListView,
    ModelDetailView,
    AppsListView,
    QueryListView,
    QueryRetrieveView,
    GenerationTemplateViewSet,
    GenerationRunView,
]


class ViewConfigurationGuardsTests(SimpleTestCase):
    def test_json_views_use_explicit_camel_case_renderer_and_parser(self):
        for view_class in STANDARD_JSON_CAMEL_CASE_VIEW_CLASSES:
            with self.subTest(view_class=view_class.__name__):
                self.assertEqual(view_class.renderer_classes, [SchemaVizCamelCaseJSONRenderer])
                self.assertEqual(view_class.parser_classes, [SchemaVizCamelCaseJSONParser])

    def test_drawing_import_view_uses_explicit_schema_viz_multipart_parser(self):
        self.assertEqual(DrawingViewSet.renderer_classes, [SchemaVizCamelCaseJSONRenderer])
        self.assertEqual(DrawingViewSet.parser_classes, [SchemaVizCamelCaseJSONParser])
        self.assertEqual(DrawingImportView.renderer_classes, [SchemaVizCamelCaseJSONRenderer])
        self.assertEqual(DrawingImportView.parser_classes, [SchemaVizCamelCaseMultiPartParser])

    def test_schema_viz_parser_uses_frozen_default_underscoreization_settings(self):
        self.assertEqual(
            SchemaVizCamelCaseJSONParser.json_underscoreize,
            SCHEMA_VIZ_JSON_UNDERSCOREIZE,
        )
        self.assertEqual(
            SchemaVizCamelCaseJSONRenderer.json_underscoreize,
            SCHEMA_VIZ_JSON_UNDERSCOREIZE,
        )
        self.assertEqual(StatelessExportView.parser_classes, [SchemaVizCamelCaseJSONParser])

    @override_settings(JSON_CAMEL_CASE={"JSON_UNDERSCOREIZE": {"ignore_fields": ("lexical_state",)}})
    def test_schema_viz_parser_does_not_consume_host_json_camel_case_settings(self):
        parser = SchemaVizCamelCaseJSONParser()
        payload = {
            "reactFlowState": {
                "nodes": [{"id": "node-1D"}],
                "edges": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            },
            "lexicalState": {
                "nodeId": {
                    "root": {
                        "children": [{"fieldName": "serverId", "type": "data-reference"}],
                        "direction": None,
                        "format": "",
                        "indent": 0,
                        "type": "root",
                        "version": 1,
                    }
                }
            },
        }

        parsed = parser.parse(
            BytesIO(json.dumps(payload).encode("utf-8")),
            parser_context={"encoding": "utf-8"},
        )

        self.assertIn("react_flow_state", parsed)
        self.assertIn("lexical_state", parsed)
        self.assertIn("nodeId", parsed["lexical_state"])
        self.assertIn("fieldName", parsed["lexical_state"]["nodeId"]["root"]["children"][0])
        self.assertEqual(
            parsed["lexical_state"]["nodeId"]["root"]["children"][0]["fieldName"],
            "serverId",
        )

    def test_schema_viz_parser_preserves_generation_definition_payloads(self):
        parser = SchemaVizCamelCaseJSONParser()
        payload = {
            "definition": {
                "rootStepId": "stepRoot",
                "stepsById": {
                    "stepRoot": {
                        "id": "stepRoot",
                        "parentId": None,
                        "childIds": ["childStep"],
                        "resolvedModelId": "infrastructure.CloudProvider",
                        "groupMode": "none",
                    }
                },
            },
            "source": {
                "inlineDefinition": {
                    "rootStepId": "stepRoot",
                    "stepsById": {
                        "stepRoot": {
                            "id": "stepRoot",
                            "parentId": None,
                            "childIds": [],
                            "resolvedModelId": "infrastructure.CloudProvider",
                            "groupMode": "none",
                        }
                    },
                }
            },
        }

        parsed = parser.parse(
            BytesIO(json.dumps(payload).encode("utf-8")),
            parser_context={"encoding": "utf-8"},
        )

        self.assertIn("definition", parsed)
        self.assertEqual(parsed["definition"]["rootStepId"], "stepRoot")
        self.assertIn("stepsById", parsed["definition"])
        self.assertIn("stepRoot", parsed["definition"]["stepsById"])
        self.assertEqual(
            parsed["definition"]["stepsById"]["stepRoot"]["parentId"],
            None,
        )
        self.assertEqual(
            parsed["definition"]["stepsById"]["stepRoot"]["childIds"],
            ["childStep"],
        )
        self.assertIn("source", parsed)
        self.assertIn("inline_definition", parsed["source"])
        self.assertEqual(
            parsed["source"]["inline_definition"]["rootStepId"],
            "stepRoot",
        )
        self.assertIn("stepsById", parsed["source"]["inline_definition"])

    def test_schema_viz_parser_preserves_style_draft_step_ids(self):
        parser = SchemaVizCamelCaseJSONParser()
        payload = {
            "source": {
                "layoutSettings": {
                    "styleDrafts": {
                        "model-1fe2d651": {
                            "textContent": {
                                "root": {
                                    "children": [
                                        {
                                            "children": [
                                                {
                                                    "path": "templates.name",
                                                    "type": "data-reference",
                                                }
                                            ],
                                            "textFormat": 0,
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        }

        parsed = parser.parse(
            BytesIO(json.dumps(payload).encode("utf-8")),
            parser_context={"encoding": "utf-8"},
        )

        style_drafts = parsed["source"]["layout_settings"]["style_drafts"]
        self.assertIn("model-1fe2d651", style_drafts)
        self.assertNotIn("model-1fe2d_651", style_drafts)
        self.assertIn("textContent", style_drafts["model-1fe2d651"])
        self.assertIn(
            "textFormat",
            style_drafts["model-1fe2d651"]["textContent"]["root"]["children"][0],
        )

    def test_schema_viz_parser_preserves_dynamic_fields_dict_keys(self):
        parser = SchemaVizCamelCaseJSONParser()
        payload = {
            "appLabel": "infrastructure",
            "fields": {
                "cidr_block": "10.0.0.0/16",
                "legacyCamelKey": "kept-for-compatibility",
            },
            "metadata": {
                "fields": [
                    {
                        "name": "cidr_block",
                        "verboseName": "CIDR block",
                        "primaryKey": False,
                    }
                ]
            },
        }

        parsed = parser.parse(
            BytesIO(json.dumps(payload).encode("utf-8")),
            parser_context={"encoding": "utf-8"},
        )

        self.assertEqual(parsed["app_label"], "infrastructure")
        self.assertIn("cidr_block", parsed["fields"])
        self.assertIn("legacyCamelKey", parsed["fields"])
        self.assertNotIn("legacy_camel_key", parsed["fields"])
        self.assertIn("verbose_name", parsed["metadata"]["fields"][0])
        self.assertIn("primary_key", parsed["metadata"]["fields"][0])
        self.assertEqual(parsed["metadata"]["fields"][0]["name"], "cidr_block")

    @override_settings(JSON_CAMEL_CASE={"JSON_UNDERSCOREIZE": {"ignore_fields": ("lexical_state",)}})
    def test_schema_viz_renderer_does_not_consume_host_json_camel_case_settings(self):
        renderer = SchemaVizCamelCaseJSONRenderer()
        rendered = renderer.render(
            {
                "react_flow_state": {
                    "nodes": [{"id": "node-1-d"}],
                    "edges": [],
                    "viewport": {"x": 0, "y": 0, "zoom": 1},
                },
                "lexical_state": {"node_id": {"field_name": "server_id"}},
            }
        )
        payload = json.loads(rendered.decode("utf-8"))

        self.assertIn("reactFlowState", payload)
        self.assertIn("lexicalState", payload)
        self.assertIn("node_id", payload["lexicalState"])
        self.assertIn("field_name", payload["lexicalState"]["node_id"])
        self.assertEqual(payload["lexicalState"]["node_id"]["field_name"], "server_id")

    def test_schema_viz_renderer_preserves_dynamic_fields_dict_keys(self):
        renderer = SchemaVizCamelCaseJSONRenderer()
        rendered = renderer.render(
            {
                "app_label": "infrastructure",
                "fields": {
                    "cidr_block": "10.0.0.0/16",
                    "legacyCamelKey": "kept-for-compatibility",
                },
                "metadata": {
                    "fields": [
                        {
                            "name": "cidr_block",
                            "verbose_name": "CIDR block",
                            "primary_key": False,
                        }
                    ]
                },
            }
        )
        payload = json.loads(rendered.decode("utf-8"))

        self.assertEqual(payload["appLabel"], "infrastructure")
        self.assertIn("cidr_block", payload["fields"])
        self.assertIn("legacyCamelKey", payload["fields"])
        self.assertNotIn("cidrBlock", payload["fields"])
        self.assertIn("verboseName", payload["metadata"]["fields"][0])
        self.assertIn("primaryKey", payload["metadata"]["fields"][0])
        self.assertEqual(payload["metadata"]["fields"][0]["name"], "cidr_block")

    def test_list_pagination_is_explicit_for_frontend_contracts(self):
        self.assertIsNone(DrawingViewSet.pagination_class)
        self.assertIsNone(StyleTemplateViewSet.pagination_class)
        self.assertIsNone(GenerationTemplateViewSet.pagination_class)
        self.assertIs(QueryListView.pagination_class, QueryPagination)
