"""
End-to-end tests for relation-path resolution at generation runtime.

Covers:
  * lexical_paths.collect_data_reference_paths — walks Lexical JSON,
    extracts ``data-reference`` paths.
  * relation_resolution.build_prefetch_plan — classifies forward vs
    reverse/M2M segments for select_related / prefetch_related.
  * relation_resolution.resolve_relation_paths — walks getattr, returns
    nested dict matching the frontend renderer's walkPath() expectations.
  * GenerationEngine — uses the above so {{templates.name}} on a
    CloudProvider node lands in fields_data as a list of dicts.
"""

from __future__ import annotations

from django.test import TestCase

from django_schema_viz.models import StyleTemplate
from django_schema_viz.utils.generation_engine import GenerationEngine
from django_schema_viz.utils.lexical_paths import (
    collect_data_reference_paths,
    has_relation_segment,
)
from django_schema_viz.utils.relation_resolution import (
    build_prefetch_plan,
    resolve_relation_paths,
)
from infrastructure.models import (
    BusinessGroup,
    CloudProvider,
    Environment,
    Network,
    Region,
    ServerTemplate,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def lex_state_with_paths(*paths: str) -> dict:
    """Minimal Lexical state with one ``data-reference`` child per path."""
    return {
        "root": {
            "children": [
                {
                    "type": "paragraph",
                    "children": [
                        {"type": "data-reference", "path": path} for path in paths
                    ],
                }
            ],
            "type": "root",
        }
    }


def lex_state_with_text(text: str) -> dict:
    """Minimal Lexical state with one plain text child."""
    return {
        "root": {
            "children": [
                {
                    "type": "paragraph",
                    "children": [{"type": "text", "text": text}],
                }
            ],
            "type": "root",
        }
    }


# ---------------------------------------------------------------------------
# lexical_paths
# ---------------------------------------------------------------------------


class CollectDataReferencePathsTests(TestCase):
    def test_extracts_flat_and_relation_paths(self):
        state = lex_state_with_paths("name", "templates.name", "region.code")
        self.assertEqual(
            collect_data_reference_paths(state),
            {"name", "templates.name", "region.code"},
        )

    def test_accepts_json_string_input(self):
        import json

        state = lex_state_with_paths("templates.name")
        self.assertEqual(
            collect_data_reference_paths(json.dumps(state)),
            {"templates.name"},
        )

    def test_accepts_legacy_field_name_keys(self):
        # Legacy lexical states used ``fieldName`` instead of ``path``.
        state = {
            "root": {
                "children": [
                    {"type": "data-reference", "fieldName": "templates.name"},
                ]
            }
        }
        self.assertEqual(
            collect_data_reference_paths(state),
            {"templates.name"},
        )

    def test_extracts_raw_text_template_placeholders(self):
        state = lex_state_with_text("Provider {{ name }} uses {{templates.name}}")

        self.assertEqual(
            collect_data_reference_paths(state),
            {"name", "templates.name"},
        )

    def test_returns_empty_for_invalid_input(self):
        self.assertEqual(collect_data_reference_paths(None), set())
        self.assertEqual(collect_data_reference_paths("not json"), set())

    def test_has_relation_segment(self):
        self.assertTrue(has_relation_segment("templates.name"))
        self.assertFalse(has_relation_segment("name"))


# ---------------------------------------------------------------------------
# Prefetch plan
# ---------------------------------------------------------------------------


class BuildPrefetchPlanTests(TestCase):
    def test_reverse_fk_uses_prefetch_related(self):
        select, prefetch = build_prefetch_plan(
            CloudProvider, {"templates.name", "regions.code"}
        )
        self.assertEqual(select, [])
        self.assertEqual(set(prefetch), {"templates", "regions"})

    def test_forward_fk_uses_select_related(self):
        # Region.provider is a forward FK → select_related.
        select, prefetch = build_prefetch_plan(Region, {"provider.name"})
        self.assertEqual(select, ["provider"])
        self.assertEqual(prefetch, [])

    def test_flat_field_paths_skipped(self):
        select, prefetch = build_prefetch_plan(CloudProvider, {"name", "slug"})
        self.assertEqual(select, [])
        self.assertEqual(prefetch, [])

    def test_mixed_chain_falls_back_to_prefetch(self):
        # ``templates.provider.name`` — reverse FK then forward FK. Must use
        # prefetch_related because select_related can't cross the reverse hop.
        select, prefetch = build_prefetch_plan(
            CloudProvider, {"templates.provider.name"}
        )
        self.assertEqual(select, [])
        self.assertEqual(prefetch, ["templates__provider"])


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


class ResolveRelationPathsTests(TestCase):
    def setUp(self):
        self.provider = CloudProvider.objects.create(name="AWS", slug="aws")
        ServerTemplate.objects.create(
            name="ubuntu-22",
            os_family="Linux",
            os_version="22.04",
            provider=self.provider,
            image_id="ami-1",
        )
        ServerTemplate.objects.create(
            name="ubuntu-24",
            os_family="Linux",
            os_version="24.04",
            provider=self.provider,
            image_id="ami-2",
        )
        Region.objects.create(
            provider=self.provider,
            name="Frankfurt",
            code="eu-central-1",
            location="Frankfurt, Germany",
        )

    def test_reverse_fk_resolves_to_list_of_dicts(self):
        resolved = resolve_relation_paths(self.provider, {"templates.name"})
        self.assertIn("templates", resolved)
        names = {item.get("name") for item in resolved["templates"]}
        self.assertEqual(names, {"ubuntu-22", "ubuntu-24"})

    def test_forward_fk_resolves_to_nested_dict(self):
        region = Region.objects.get(code="eu-central-1")
        resolved = resolve_relation_paths(region, {"provider.name"})
        self.assertEqual(resolved, {"provider": {"name": "AWS"}})

    def test_multiple_paths_on_same_relation_merge(self):
        resolved = resolve_relation_paths(
            self.provider, {"templates.name", "templates.os_family"}
        )
        self.assertEqual(
            sorted((item["name"], item["os_family"]) for item in resolved["templates"]),
            [("ubuntu-22", "Linux"), ("ubuntu-24", "Linux")],
        )

    def test_flat_field_paths_are_ignored(self):
        # Already covered by DynamicModelSerializer; resolver shouldn't
        # duplicate the work.
        resolved = resolve_relation_paths(self.provider, {"name", "slug"})
        self.assertEqual(resolved, {})

    def test_unknown_relation_leaves_empty(self):
        resolved = resolve_relation_paths(self.provider, {"nonexistent.name"})
        self.assertEqual(resolved, {})

    def test_path_depth_limit_drops_overdeep_paths(self):
        # 4 segments (3 relations + scalar) hits the depth cap.
        resolved = resolve_relation_paths(
            self.provider, {"templates.provider.regions.code"}
        )
        # Cap is generous enough to allow 3 relation segments — assert the
        # mechanism by going one deeper.
        resolved_too_deep = resolve_relation_paths(
            self.provider, {"templates.provider.regions.networks.cidr_block"}
        )
        self.assertEqual(resolved_too_deep, {})
        # The 3-relation case (templates.provider.regions.code) should still
        # resolve since it has 4 segments total (3 relations + 1 scalar) and
        # depth cap counts relations.
        self.assertIn("templates", resolved)

    def test_accessibility_check_gates_related_models(self):
        def deny_templates(user, app_label, model_name):
            return model_name != "servertemplate"

        resolved = resolve_relation_paths(
            self.provider,
            {"templates.name"},
            accessibility_check=deny_templates,
        )
        self.assertEqual(resolved, {})


# ---------------------------------------------------------------------------
# Engine integration — the bug the user reported
# ---------------------------------------------------------------------------


class GenerationEngineRelationResolutionTests(TestCase):
    def setUp(self):
        from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry

        seed_qlab_registry()

        self.provider = CloudProvider.objects.create(name="AWS", slug="aws")
        ServerTemplate.objects.create(
            name="ubuntu-22",
            os_family="Linux",
            os_version="22.04",
            provider=self.provider,
            image_id="ami-1",
        )
        ServerTemplate.objects.create(
            name="ubuntu-24",
            os_family="Linux",
            os_version="24.04",
            provider=self.provider,
            image_id="ami-2",
        )

        # StyleTemplate whose lexical content references {{templates.name}}.
        self.style_template = StyleTemplate.objects.create(
            name="Provider card",
            text_content=lex_state_with_paths("name", "templates.name"),
            visual_styles={},
            dimensions={"width": 240, "height": 120},
            is_global=True,
        )

        self.definition = {
            "rootStepId": "step-root",
            "stepsById": {
                "step-root": {
                    "id": "step-root",
                    "parentId": None,
                    "childIds": [],
                    "relationship": None,
                    "resolvedModelId": "infrastructure.CloudProvider",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": str(self.style_template.id),
                    "label": None,
                    "filter": None,
                }
            },
        }

    def test_execute_resolves_reverse_fk_relation_path(self):
        engine = GenerationEngine(
            root_model="infrastructure.CloudProvider",
            definition=self.definition,
        )
        result = engine.execute(record_pk=str(self.provider.pk))

        self.assertEqual(len(result.nodes), 1)
        node = result.nodes[0]

        # The flat field is still served by DynamicModelSerializer.
        self.assertEqual(node.fields.get("name"), "AWS")
        # The relation path is materialised as a list of dicts, ready for
        # the frontend renderer's walkPath() to format.
        templates = node.fields.get("templates")
        self.assertIsInstance(templates, list)
        self.assertEqual(
            sorted(item.get("name") for item in templates),
            ["ubuntu-22", "ubuntu-24"],
        )

    def test_execute_with_no_relation_paths_skips_resolver(self):
        # When the lexical state has no relation paths, fields_data shouldn't
        # gain phantom keys.
        self.style_template.text_content = lex_state_with_paths("name", "slug")
        self.style_template.save(update_fields=["text_content"])

        engine = GenerationEngine(
            root_model="infrastructure.CloudProvider",
            definition=self.definition,
        )
        result = engine.execute(record_pk=str(self.provider.pk))
        node = result.nodes[0]
        self.assertNotIn("templates", node.fields)
        self.assertNotIn("regions", node.fields)

    def test_execute_resolves_paths_from_layout_settings_style_draft(self):
        """
        Live-run path: the chip lives in a styleDraft attached to the step
        via layoutSettings (not a saved StyleTemplate row). The engine must
        discover the draft, walk its lexical state, and emit resolved data.
        """
        # Step has no styleTemplateId — exactly the user's request shape.
        self.definition["stepsById"]["step-root"]["styleTemplateId"] = None

        layout_settings = {
            "styleDrafts": {
                "step-root": {
                    "textContent": lex_state_with_paths("templates.name"),
                }
            }
        }

        engine = GenerationEngine(
            root_model="infrastructure.CloudProvider",
            definition=self.definition,
            layout_settings=layout_settings,
        )
        result = engine.execute(record_pk=str(self.provider.pk))
        node = result.nodes[0]

        templates = node.fields.get("templates")
        self.assertIsInstance(templates, list)
        self.assertEqual(
            sorted(item.get("name") for item in templates),
            ["ubuntu-22", "ubuntu-24"],
        )

    def test_execute_resolves_paths_from_raw_text_style_draft(self):
        """
        Users may type ``{{templates.name}}`` as raw text instead of committing
        it as a data-reference chip. The backend must still discover the path
        so live preview receives the nested relation data.
        """
        self.definition["stepsById"]["step-root"]["styleTemplateId"] = None

        layout_settings = {
            "styleDrafts": {
                "step-root": {
                    "textContent": lex_state_with_text("{{templates.name}}"),
                }
            }
        }

        engine = GenerationEngine(
            root_model="infrastructure.CloudProvider",
            definition=self.definition,
            layout_settings=layout_settings,
        )
        result = engine.execute(record_pk=str(self.provider.pk))
        node = result.nodes[0]

        templates = node.fields.get("templates")
        self.assertIsInstance(templates, list)
        self.assertEqual(
            sorted(item.get("name") for item in templates),
            ["ubuntu-22", "ubuntu-24"],
        )

    def test_draft_text_content_overrides_style_template_lexical_state(self):
        """
        When a step references a StyleTemplate AND a styleDraft is present
        for the same step, the draft wins (matches the frontend renderer
        which prefers draft.textContent over styleTemplate.textContent).
        """
        # Saved template references the wrong relation; draft fixes it.
        self.style_template.text_content = lex_state_with_paths("regions.code")
        self.style_template.save(update_fields=["text_content"])

        layout_settings = {
            "styleDrafts": {
                "step-root": {
                    "textContent": lex_state_with_paths("templates.name"),
                }
            }
        }

        engine = GenerationEngine(
            root_model="infrastructure.CloudProvider",
            definition=self.definition,
            layout_settings=layout_settings,
        )
        result = engine.execute(record_pk=str(self.provider.pk))
        node = result.nodes[0]

        # Draft path resolved, saved-template path NOT resolved (since draft
        # supersedes it on this step).
        self.assertIn("templates", node.fields)
        self.assertNotIn("regions", node.fields)

    def test_engine_accepts_snake_case_layout_settings_keys(self):
        # When the request travels through CamelCaseJSONParser the keys may
        # arrive as ``style_drafts``/``text_content``. Engine must accept both.
        self.definition["stepsById"]["step-root"]["styleTemplateId"] = None
        layout_settings = {
            "style_drafts": {
                "step-root": {
                    "text_content": lex_state_with_paths("templates.name"),
                }
            }
        }

        engine = GenerationEngine(
            root_model="infrastructure.CloudProvider",
            definition=self.definition,
            layout_settings=layout_settings,
        )
        result = engine.execute(record_pk=str(self.provider.pk))
        self.assertIsInstance(result.nodes[0].fields.get("templates"), list)

    def test_nested_hidden_route_resolves_style_draft_paths_on_visible_child(self):
        """
        Regression for the builder live-preview shape:

        BusinessGroup -> Network (hidden) -> Region (hidden) -> CloudProvider.
        The visible child step owns a styleDraft with ``templates.name``; the
        backend must resolve it against CloudProvider even when the root record
        and traversal path are different models.
        """
        manager = None
        group = BusinessGroup.objects.create(name="IT Department", manager=manager)
        environment = Environment.objects.create(
            name="Production",
            env_type="prod",
            business_group=group,
        )
        region = Region.objects.create(
            provider=self.provider,
            name="Frankfurt",
            code="eu-central-1",
            location="Frankfurt, Germany",
        )
        Network.objects.create(
            name="core-network",
            cidr_block="10.0.0.0/16",
            region=region,
            environment=environment,
            business_group=group,
        )

        definition = {
            "rootStepId": "business-group",
            "stepsById": {
                "business-group": {
                    "id": "business-group",
                    "parentId": None,
                    "childIds": ["network-hop"],
                    "relationship": None,
                    "resolvedModelId": "infrastructure.BusinessGroup",
                    "visibility": "visible",
                    "groupMode": "group",
                    "styleTemplateId": None,
                    "label": "business group",
                    "filter": None,
                },
                "network-hop": {
                    "id": "network-hop",
                    "parentId": "business-group",
                    "childIds": ["region-hop"],
                    "relationship": "networks",
                    "resolvedModelId": "infrastructure.Network",
                    "visibility": "hidden",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": None,
                    "filter": None,
                },
                "region-hop": {
                    "id": "region-hop",
                    "parentId": "network-hop",
                    "childIds": ["cloud-provider"],
                    "relationship": "region",
                    "resolvedModelId": "infrastructure.Region",
                    "visibility": "hidden",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": None,
                    "filter": None,
                },
                "cloud-provider": {
                    "id": "cloud-provider",
                    "parentId": "region-hop",
                    "childIds": [],
                    "relationship": "provider",
                    "resolvedModelId": "infrastructure.CloudProvider",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "cloud provider",
                    "filter": None,
                },
            },
        }
        layout_settings = {
            "styleDrafts": {
                "cloud-provider": {
                    "textContent": lex_state_with_paths("templates.name"),
                }
            }
        }

        engine = GenerationEngine(
            root_model="infrastructure.BusinessGroup",
            definition=definition,
            layout_settings=layout_settings,
        )
        result = engine.execute(record_pk=str(group.pk))
        provider_node = next(
            node
            for node in result.nodes
            if "cloud-provider" in node.step_ui_ids
        )

        templates = provider_node.fields.get("templates")
        self.assertIsInstance(templates, list)
        self.assertEqual(
            sorted(item.get("name") for item in templates),
            ["ubuntu-22", "ubuntu-24"],
        )
