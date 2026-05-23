from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from django_schema_viz.models import (
    GenerationTemplate,
    GenerationTemplateVersion,
    StyleTemplate,
)
from django_schema_viz.tests.qlab_registry_helpers import seed_qlab_registry
from infrastructure.models import (
    BusinessGroup,
    CloudProvider,
    Environment,
    LoadBalancer,
    Network,
    Region,
    Server,
    ServerTemplate,
    Subnet,
)

User = get_user_model()

GENERATION_TEMPLATES_URL = "/schema-viz/generation-templates/"
GENERATION_RUNS_URL = "/schema-viz/generation-runs/"


def build_definition(
    root_model: str, root_step: dict | None = None, steps: list[dict] | None = None
):
    step_map = {}

    def add_step(step: dict):
        step_map[step["id"]] = step
        for child in step.pop("_children", []):
            add_step(child)

    root = {
        "id": "step-root",
        "parentId": None,
        "childIds": [step["id"] for step in steps or []],
        "relationship": None,
        "resolvedModelId": root_model,
        "visibility": "visible",
        "groupMode": "none",
        "styleTemplateId": None,
        "label": None,
        "filter": None,
        **(root_step or {}),
    }
    add_step(root)
    for step in steps or []:
        add_step(step)
    return {"rootStepId": root["id"], "stepsById": step_map}


def build_step(
    *,
    step_id: str,
    parent_id: str,
    relationship: str,
    resolved_model: str,
    child_ids: list[str] | None = None,
    visibility: str = "visible",
    group_mode: str = "none",
    style_template_id: str | None = None,
    filter_fields: dict | None = None,
):
    return {
        "id": step_id,
        "parentId": parent_id,
        "childIds": child_ids or [],
        "relationship": relationship,
        "resolvedModelId": resolved_model,
        "visibility": visibility,
        "groupMode": group_mode,
        "styleTemplateId": style_template_id,
        "label": None,
        "filter": filter_fields,
    }


def attach_published_version(template: GenerationTemplate, definition: dict):
    version = GenerationTemplateVersion.objects.create(
        template=template,
        version_number=1,
        root_model=template.root_model,
        definition=definition,
        layout_settings={},
        created_by=template.owner,
    )
    GenerationTemplate.objects.filter(pk=template.pk).update(
        steps=definition,
        draft_version=version,
        published_version=version,
        published_at=timezone.now(),
        published_by=template.owner,
    )
    template.refresh_from_db()
    return template


class GenerationTemplateExecuteViewTests(APITestCase):
    def setUp(self):
        seed_qlab_registry()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
        )
        self.style_template = StyleTemplate.objects.create(
            name="Server style",
            owner=self.owner,
            visual_styles={"backgroundColor": "#eee"},
            dimensions={"width": 240, "height": 120},
            is_global=False,
        )
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
        )
        self.provider = CloudProvider.objects.create(
            name="Amazon Web Services",
            slug="aws",
        )
        self.region = Region.objects.create(
            provider=self.provider,
            name="Frankfurt",
            code="eu-central-1",
            location="Frankfurt, Germany",
        )
        self.core_group = BusinessGroup.objects.create(
            name="Core Platform",
            manager=self.manager,
        )
        self.edge_group = BusinessGroup.objects.create(
            name="Edge Delivery",
            manager=self.manager,
        )
        self.core_environment = Environment.objects.create(
            name="Core Prod",
            env_type="prod",
            business_group=self.core_group,
        )
        self.edge_environment = Environment.objects.create(
            name="Edge Prod",
            env_type="prod",
            business_group=self.edge_group,
        )
        self.core_network = Network.objects.create(
            name="core-network",
            cidr_block="10.0.0.0/16",
            region=self.region,
            environment=self.core_environment,
            business_group=self.core_group,
        )
        self.edge_network = Network.objects.create(
            name="edge-network",
            cidr_block="10.1.0.0/16",
            region=self.region,
            environment=self.edge_environment,
            business_group=self.edge_group,
        )
        self.subnet = Subnet.objects.create(
            name="public-a",
            cidr_block="10.0.1.0/24",
            subnet_type="public",
            network=self.core_network,
            availability_zone="eu-central-1a",
        )
        self.server_template = ServerTemplate.objects.create(
            name="Ubuntu",
            os_family="Linux",
            os_version="24.04",
            provider=self.provider,
            image_id="ami-123",
        )
        self.core_server = Server.objects.create(
            hostname="core-1",
            ip_address="10.0.1.10",
            instance_type="t3.medium",
            status="running",
            subnet=self.subnet,
            template=self.server_template,
            environment=self.core_environment,
            business_group=self.core_group,
            owner=self.owner,
        )
        self.edge_server = Server.objects.create(
            hostname="edge-1",
            ip_address="10.0.1.11",
            instance_type="t3.medium",
            status="running",
            subnet=self.subnet,
            template=self.server_template,
            environment=self.edge_environment,
            business_group=self.edge_group,
            owner=self.owner,
        )
        self.load_balancer = LoadBalancer.objects.create(
            name="ingress",
            dns_name="ingress.example.com",
            subnet=self.subnet,
            environment=self.core_environment,
            is_active=True,
        )
        self.load_balancer.servers.add(self.core_server, self.edge_server)

        definition = build_definition(
            "infrastructure.CloudProvider",
            root_step={"styleTemplateId": str(self.style_template.id)},
        )
        self.template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Global Server Overview",
                owner=self.owner,
                is_global=True,
                root_model="infrastructure.CloudProvider",
                steps=definition,
            ),
            definition,
        )

    def run_published_template(self, template, record):
        return self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "live",
                "recordId": str(record.pk),
                "source": {
                    "templateId": str(template.pk),
                    "version": "published",
                },
            },
            format="json",
        )

    def test_structure_run_accepts_default_reverse_accessors_from_schema_routes(self):
        self.client.force_authenticate(self.other_user)
        group = self.other_user.groups.create(name="Operators")
        definition = build_definition(
            "auth.Group",
            steps=[
                build_step(
                    step_id="step-users",
                    parent_id="step-root",
                    relationship="user_set",
                    resolved_model="auth.User",
                )
            ],
        )

        response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "structure",
                "source": {
                    "rootModel": "auth.Group",
                    "inlineDefinition": definition,
                    "layoutSettings": {},
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.json())
        node_ids = {node["id"] for node in response.json()["result"]["nodes"]}
        self.assertIn("struct:step-root", node_ids)
        self.assertIn("struct:step-users", node_ids)
        self.assertEqual(group.user_set.count(), 1)

    def test_execute_returns_style_templates_for_accessible_template(self):
        self.client.force_authenticate(self.other_user)

        response = self.run_published_template(self.template, self.provider)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("result", body)
        self.assertIn("styleTemplates", body)
        self.assertEqual(len(body["result"]["nodes"]), 1)
        self.assertEqual(len(body["styleTemplates"]), 1)
        self.assertEqual(body["styleTemplates"][0]["id"], str(self.style_template.id))

    def test_inline_run_resolves_style_draft_relation_paths_with_generated_step_ids(self):
        self.client.force_authenticate(self.other_user)
        root_step_id = "model-aeefc762"
        provider_step_id = "model-1fe2d651"
        network_hop_id = "edge-model-aeefc762--model-1fe2d651-r0:hop-1"
        region_hop_id = "edge-model-aeefc762--model-1fe2d651-r0:hop-2"
        definition = {
            "rootStepId": root_step_id,
            "stepsById": {
                root_step_id: {
                    "id": root_step_id,
                    "parentId": None,
                    "childIds": [network_hop_id],
                    "relationship": None,
                    "resolvedModelId": "infrastructure.businessgroup",
                    "visibility": "visible",
                    "groupMode": "group",
                    "styleTemplateId": None,
                    "label": "business group",
                    "filter": None,
                },
                provider_step_id: {
                    "id": provider_step_id,
                    "parentId": region_hop_id,
                    "childIds": [],
                    "relationship": "provider",
                    "resolvedModelId": "infrastructure.CloudProvider",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "cloud provider",
                    "filter": None,
                },
                network_hop_id: {
                    "id": network_hop_id,
                    "parentId": root_step_id,
                    "childIds": [region_hop_id],
                    "relationship": "networks",
                    "resolvedModelId": "infrastructure.Network",
                    "visibility": "hidden",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": None,
                    "filter": None,
                },
                region_hop_id: {
                    "id": region_hop_id,
                    "parentId": network_hop_id,
                    "childIds": [provider_step_id],
                    "relationship": "region",
                    "resolvedModelId": "infrastructure.Region",
                    "visibility": "hidden",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": None,
                    "filter": None,
                },
            },
        }

        response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "live",
                "recordId": str(self.core_group.pk),
                "source": {
                    "inlineDefinition": definition,
                    "rootModel": "infrastructure.businessgroup",
                    "layoutSettings": {
                        "styleDrafts": {
                            provider_step_id: {
                                "textContent": {
                                    "root": {
                                        "children": [
                                            {
                                                "children": [
                                                    {
                                                        "path": "templates.name",
                                                        "styles": {},
                                                        "type": "data-reference",
                                                        "version": 1,
                                                    }
                                                ],
                                                "type": "paragraph",
                                                "version": 1,
                                            }
                                        ],
                                        "type": "root",
                                        "version": 1,
                                    }
                                }
                            }
                        }
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.json())
        provider_node = next(
            node
            for node in response.json()["result"]["nodes"]
            if provider_step_id in node.get("stepUiIds", [])
        )
        self.assertEqual(
            [item["name"] for item in provider_node["fields"]["templates"]],
            [self.server_template.name],
        )

    def test_execute_filters_reverse_relations_and_prunes_unmatched_children(self):
        self.client.force_authenticate(self.other_user)
        region_step = build_step(
            step_id="step-region",
            parent_id="step-root",
            relationship="regions",
            resolved_model="infrastructure.Region",
            child_ids=["step-network"],
            visibility="hidden",
        )
        network_step = build_step(
            step_id="step-network",
            parent_id="step-region",
            relationship="networks",
            resolved_model="infrastructure.Network",
            style_template_id=str(self.style_template.id),
            filter_fields={
                "andOperation": [
                    {
                        "field": "business_group__name",
                        "op": "is",
                        "value": self.core_group.name,
                    }
                ]
            },
        )
        definition = build_definition(
            "infrastructure.CloudProvider",
            root_step={"childIds": ["step-region"]},
            steps=[region_step, network_step],
        )
        template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Filtered network overview",
                owner=self.owner,
                is_global=True,
                root_model="infrastructure.CloudProvider",
                steps=definition,
            ),
            definition,
        )

        response = self.run_published_template(template, self.provider)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["result"]["nodes"]), 2)
        self.assertEqual(len(body["result"]["edges"]), 1)
        self.assertEqual(body["filterImpact"], [])
        returned_ids = {node["recordPk"] for node in body["result"]["nodes"]}
        self.assertIn(str(self.provider.pk), returned_ids)
        self.assertIn(str(self.core_network.pk), returned_ids)
        self.assertNotIn(str(self.edge_network.pk), returned_ids)
        network_node = next(
            node
            for node in body["result"]["nodes"]
            if node["modelName"] == "network"
            and node["recordPk"] == str(self.core_network.pk)
        )
        self.assertEqual(network_node["fields"]["cidr_block"], "10.0.0.0/16")
        self.assertNotIn("cidrBlock", network_node["fields"])

    def test_execute_filters_forward_relations(self):
        self.client.force_authenticate(self.other_user)
        definition = build_definition(
            "infrastructure.Network",
            root_step={"childIds": ["step-business-group"]},
            steps=[
                build_step(
                    step_id="step-business-group",
                    parent_id="step-root",
                    relationship="business_group",
                    resolved_model="infrastructure.BusinessGroup",
                    style_template_id=str(self.style_template.id),
                    filter_fields={
                        "andOperation": [
                            {
                                "field": "name",
                                "op": "is",
                                "value": self.core_group.name,
                            }
                        ]
                    },
                )
            ],
        )
        template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Filtered business group overview",
                owner=self.owner,
                is_global=True,
                root_model="infrastructure.Network",
                steps=definition,
            ),
            definition,
        )

        response = self.run_published_template(template, self.edge_network)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["result"]["nodes"]), 1)
        self.assertEqual(
            body["result"]["nodes"][0]["recordPk"], str(self.edge_network.pk)
        )
        self.assertEqual(len(body["filterImpact"]), 1)
        impact = body["filterImpact"][0]
        self.assertEqual(impact["stepId"], "step-business-group")
        self.assertEqual(impact["parentStepId"], "step-root")
        self.assertEqual(impact["relationship"], "business_group")
        self.assertEqual(impact["parentModel"], "infrastructure.Network")
        self.assertEqual(impact["parentRecordPk"], str(self.edge_network.pk))
        self.assertEqual(impact["targetModel"], "infrastructure.BusinessGroup")
        self.assertIn(
            "removed all infrastructure.BusinessGroup records",
            impact["message"],
        )

    def test_execute_filters_many_to_many_relations(self):
        self.client.force_authenticate(self.other_user)
        definition = build_definition(
            "infrastructure.LoadBalancer",
            root_step={"childIds": ["step-server"]},
            steps=[
                build_step(
                    step_id="step-server",
                    parent_id="step-root",
                    relationship="servers",
                    resolved_model="infrastructure.Server",
                    style_template_id=str(self.style_template.id),
                    filter_fields={
                        "andOperation": [
                            {
                                "field": "business_group__name",
                                "op": "is",
                                "value": self.core_group.name,
                            }
                        ]
                    },
                )
            ],
        )
        template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Filtered server overview",
                owner=self.owner,
                is_global=True,
                root_model="infrastructure.LoadBalancer",
                steps=definition,
            ),
            definition,
        )

        response = self.run_published_template(template, self.load_balancer)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        returned_ids = {node["recordPk"] for node in body["result"]["nodes"]}
        self.assertIn(str(self.load_balancer.pk), returned_ids)
        self.assertIn(str(self.core_server.pk), returned_ids)
        self.assertNotIn(str(self.edge_server.pk), returned_ids)
        self.assertEqual(body["filterImpact"], [])

    def test_execute_does_not_warn_when_filtered_relationship_has_no_records(self):
        self.client.force_authenticate(self.other_user)
        empty_provider = CloudProvider.objects.create(
            name="Empty Provider",
            slug="empty-provider",
        )
        definition = build_definition(
            "infrastructure.CloudProvider",
            root_step={"childIds": ["step-region"]},
            steps=[
                build_step(
                    step_id="step-region",
                    parent_id="step-root",
                    relationship="regions",
                    resolved_model="infrastructure.Region",
                    style_template_id=str(self.style_template.id),
                    filter_fields={
                        "andOperation": [
                            {
                                "field": "name",
                                "op": "is",
                                "value": "does-not-exist",
                            }
                        ]
                    },
                )
            ],
        )
        template = attach_published_version(
            GenerationTemplate.objects.create(
                name="No related region overview",
                owner=self.owner,
                is_global=True,
                root_model="infrastructure.CloudProvider",
                steps=definition,
            ),
            definition,
        )

        response = self.run_published_template(template, empty_provider)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["result"]["nodes"]), 1)
        self.assertEqual(
            body["result"]["nodes"][0]["recordPk"],
            str(empty_provider.pk),
        )
        self.assertEqual(body["filterImpact"], [])

    def test_execute_keeps_all_many_to_one_edges_when_hidden_steps_reuse_a_visible_target(
        self,
    ):
        self.client.force_authenticate(self.other_user)
        server_step = build_step(
            step_id="step-server",
            parent_id="step-root",
            relationship="servers",
            resolved_model="infrastructure.Server",
            child_ids=["step-subnet"],
        )
        subnet_step = build_step(
            step_id="step-subnet",
            parent_id="step-server",
            relationship="subnet",
            resolved_model="infrastructure.Subnet",
            child_ids=["step-network"],
            visibility="hidden",
        )
        network_step = build_step(
            step_id="step-network",
            parent_id="step-subnet",
            relationship="network",
            resolved_model="infrastructure.Network",
            style_template_id=str(self.style_template.id),
        )
        definition = build_definition(
            "infrastructure.LoadBalancer",
            root_step={"childIds": ["step-server"]},
            steps=[server_step, subnet_step, network_step],
        )
        template = attach_published_version(
            GenerationTemplate.objects.create(
                name="Shared network fan-in",
                owner=self.owner,
                is_global=True,
                root_model="infrastructure.LoadBalancer",
                steps=definition,
            ),
            definition,
        )

        response = self.run_published_template(template, self.load_balancer)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        returned_ids = {node["recordPk"] for node in body["result"]["nodes"]}
        self.assertEqual(
            returned_ids,
            {
                str(self.load_balancer.pk),
                str(self.core_server.pk),
                str(self.edge_server.pk),
                str(self.core_network.pk),
            },
        )
        returned_edges = {
            (edge["source"], edge["target"], edge["relationship"])
            for edge in body["result"]["edges"]
        }
        network_node_id = next(
            node["id"]
            for node in body["result"]["nodes"]
            if node["modelName"] == "network"
            and node["recordPk"] == str(self.core_network.pk)
        )
        core_server_node_id = next(
            node["id"]
            for node in body["result"]["nodes"]
            if node["modelName"] == "server"
            and node["recordPk"] == str(self.core_server.pk)
        )
        edge_server_node_id = next(
            node["id"]
            for node in body["result"]["nodes"]
            if node["modelName"] == "server"
            and node["recordPk"] == str(self.edge_server.pk)
        )

        self.assertIn(
            (core_server_node_id, network_node_id, "network"),
            returned_edges,
        )
        self.assertIn(
            (edge_server_node_id, network_node_id, "network"),
            returned_edges,
        )

    def test_create_rejects_invalid_step_filter_field(self):
        self.client.force_authenticate(self.owner)
        definition = build_definition(
            "infrastructure.CloudProvider",
            root_step={"childIds": ["step-region"]},
            steps=[
                build_step(
                    step_id="step-region",
                    parent_id="step-root",
                    relationship="regions",
                    resolved_model="infrastructure.Region",
                    filter_fields={
                        "andOperation": [{"field": "unknown", "op": "is", "value": "x"}]
                    },
                )
            ],
        )

        response = self.client.post(
            GENERATION_TEMPLATES_URL,
            {
                "name": "Invalid filter template",
                "description": "",
                "rootModel": "infrastructure.CloudProvider",
                "scope": "owner",
                "featured": {"enabled": False, "rank": None},
                "shareSlug": None,
                "definition": definition,
                "layoutSettings": {},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("definition", response.json())

    def test_preview_returns_step_ui_ids(self):
        self.client.force_authenticate(self.other_user)
        region_step = build_step(
            step_id="step-networks",
            parent_id="step-root",
            relationship="regions",
            resolved_model="infrastructure.Region",
            child_ids=["step-network-node"],
            visibility="hidden",
        )
        network_step = build_step(
            step_id="step-network-node",
            parent_id="step-networks",
            relationship="networks",
            resolved_model="infrastructure.Network",
            style_template_id=str(self.style_template.id),
            filter_fields={
                "andOperation": [
                    {
                        "field": "business_group__name",
                        "op": "is",
                        "value": self.core_group.name,
                    }
                ]
            },
        )
        definition = build_definition(
            "infrastructure.CloudProvider",
            root_step={
                "id": "step-root",
                "childIds": ["step-networks"],
                "styleTemplateId": str(self.style_template.id),
            },
            steps=[region_step, network_step],
        )

        response = self.client.post(
            GENERATION_RUNS_URL,
            {
                "mode": "structure",
                "source": {
                    "rootModel": "infrastructure.CloudProvider",
                    "inlineDefinition": definition,
                    "layoutSettings": {},
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        root_node = next(
            node for node in body["result"]["nodes"] if node["id"] == "struct:step-root"
        )
        network_node = next(
            node
            for node in body["result"]["nodes"]
            if node["id"] == "struct:step-network-node"
        )
        self.assertEqual(root_node["stepUiIds"], ["step-root"])
        self.assertEqual(network_node["stepUiIds"], ["step-network-node"])
