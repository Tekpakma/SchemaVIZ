from django.contrib.auth.models import User
from infrastructure.models import *
from django_schema_viz.models import GenerationTemplate, GenerationTemplateVersion
from django_schema_viz.utils.generation_definition import (
    normalize_generation_definition,
)

print("Creating test infrastructure data...")

# Create user (or get existing)
admin, created = User.objects.get_or_create(
    username="kai", defaults={"email": "news@kaso.dev"}
)
if created:
    admin.set_password("kaiistcool")
    admin.save()
    print("✓ Created admin user")
else:
    print("✓ Admin user already exists")

# Create Cloud Providers
aws, _ = CloudProvider.objects.get_or_create(
    slug="aws",
    defaults={"name": "Amazon Web Services", "api_endpoint": "https://aws.amazon.com"},
)
print("✓ Created AWS provider")

azure, _ = CloudProvider.objects.get_or_create(
    slug="azure",
    defaults={"name": "Microsoft Azure", "api_endpoint": "https://azure.microsoft.com"},
)
print("✓ Created Azure provider")

# Create Regions
eu_central, _ = Region.objects.get_or_create(
    provider=aws,
    code="eu-central-1",
    defaults={"name": "EU Central 1", "location": "Frankfurt, Germany"},
)

us_east, _ = Region.objects.get_or_create(
    provider=aws,
    code="us-east-1",
    defaults={"name": "US East 1", "location": "Virginia, USA"},
)

west_europe, _ = Region.objects.get_or_create(
    provider=azure,
    code="westeurope",
    defaults={"name": "West Europe", "location": "Netherlands"},
)
print("✓ Created regions")

# Create Business Groups
it_dept, _ = BusinessGroup.objects.get_or_create(
    name="IT Department",
    defaults={
        "description": "Information Technology",
        "cost_center": "IT-001",
        "manager": admin,
    },
)

engineering, _ = BusinessGroup.objects.get_or_create(
    name="Engineering",
    defaults={
        "description": "Software Engineering Team",
        "cost_center": "ENG-001",
        "parent": it_dept,
        "manager": admin,
    },
)
print("✓ Created business groups")

# Create Environments
prod_env, _ = Environment.objects.get_or_create(
    name="Production", business_group=engineering, defaults={"env_type": "prod"}
)

dev_env, _ = Environment.objects.get_or_create(
    name="Development", business_group=engineering, defaults={"env_type": "dev"}
)
print("✓ Created environments")

# Create Networks
prod_network, _ = Network.objects.get_or_create(
    name="Production VPC",
    defaults={
        "cidr_block": "10.0.0.0/16",
        "region": eu_central,
        "environment": prod_env,
        "business_group": engineering,
    },
)

dev_network, _ = Network.objects.get_or_create(
    name="Development VPC",
    defaults={
        "cidr_block": "10.1.0.0/16",
        "region": eu_central,
        "environment": dev_env,
        "business_group": engineering,
    },
)
print("✓ Created networks")

# Create Subnets
prod_public, _ = Subnet.objects.get_or_create(
    name="Production Public Subnet",
    network=prod_network,
    defaults={
        "cidr_block": "10.0.1.0/24",
        "subnet_type": "public",
        "availability_zone": "eu-central-1a",
    },
)

prod_private, _ = Subnet.objects.get_or_create(
    name="Production Private Subnet",
    network=prod_network,
    defaults={
        "cidr_block": "10.0.2.0/24",
        "subnet_type": "private",
        "availability_zone": "eu-central-1a",
    },
)

dev_public, _ = Subnet.objects.get_or_create(
    name="Dev Public Subnet",
    network=dev_network,
    defaults={
        "cidr_block": "10.1.1.0/24",
        "subnet_type": "public",
        "availability_zone": "eu-central-1a",
    },
)
print("✓ Created subnets")

# Create Server Templates
ubuntu_template, _ = ServerTemplate.objects.get_or_create(
    name="Ubuntu 22.04 LTS",
    provider=aws,
    defaults={
        "os_family": "Linux",
        "os_version": "22.04",
        "image_id": "ami-0123456789",
    },
)
print("✓ Created server template")

# Create Servers
web_server_1, _ = Server.objects.get_or_create(
    hostname="web-prod-01",
    defaults={
        "ip_address": "10.0.1.10",
        "instance_type": "t3.medium",
        "status": "running",
        "subnet": prod_public,
        "template": ubuntu_template,
        "environment": prod_env,
        "business_group": engineering,
        "owner": admin,
        "tags": {"role": "webserver", "app": "frontend"},
    },
)

app_server_1, _ = Server.objects.get_or_create(
    hostname="app-prod-01",
    defaults={
        "ip_address": "10.0.2.10",
        "instance_type": "t3.large",
        "status": "running",
        "subnet": prod_private,
        "template": ubuntu_template,
        "environment": prod_env,
        "business_group": engineering,
        "owner": admin,
        "tags": {"role": "application", "app": "backend"},
    },
)

dev_server_1, _ = Server.objects.get_or_create(
    hostname="dev-01",
    defaults={
        "ip_address": "10.1.1.10",
        "instance_type": "t3.small",
        "status": "running",
        "subnet": dev_public,
        "template": ubuntu_template,
        "environment": dev_env,
        "business_group": engineering,
        "owner": admin,
        "tags": {"role": "development"},
    },
)
print("✓ Created servers")

# Create Load Balancer
prod_lb, _ = LoadBalancer.objects.get_or_create(
    name="Production Load Balancer",
    defaults={
        "dns_name": "prod-lb.example.com",
        "subnet": prod_public,
        "environment": prod_env,
    },
)
prod_lb.servers.add(web_server_1)
print("✓ Created load balancer")

# Create Security Group
web_sg, _ = SecurityGroup.objects.get_or_create(
    name="Web Security Group",
    defaults={"description": "Security group for web servers", "network": prod_network},
)
web_sg.servers.add(web_server_1)
print("✓ Created security group")

# Create Security Rules
SecurityRule.objects.get_or_create(
    security_group=web_sg,
    direction="inbound",
    protocol="tcp",
    port_range="80",
    defaults={"source_cidr": "0.0.0.0/0", "description": "Allow HTTP"},
)

SecurityRule.objects.get_or_create(
    security_group=web_sg,
    direction="inbound",
    protocol="tcp",
    port_range="443",
    defaults={"source_cidr": "0.0.0.0/0", "description": "Allow HTTPS"},
)
print("✓ Created security rules")

# Create Monitoring Alert
MonitoringAlert.objects.get_or_create(
    server=web_server_1,
    severity="warning",
    message="CPU usage above 80%",
    defaults={"is_resolved": False},
)
print("✓ Created monitoring alert")

print("\n✅ Infrastructure test data created successfully!")
# ============================================================================
# APPEND TO create_infrastructure_data.py
# ============================================================================
#
# Add to imports at top:
#   from django_schema_viz.models import GenerationTemplate

# ---------------------------------------------------------------------------
# Generation Template 1: "Server Overview"
#
# Starts from a Server, shows its network context.
# Subnet is hidden — Network connects directly back to Server visually.
#
#   Server (visible)
#     ├─ subnet (hidden)
#     │    └─ network (visible)  ──> visually connects to Server
#     ├─ environment (visible)
#     └─ business_group (visible)
# ---------------------------------------------------------------------------

server_overview, created = GenerationTemplate.objects.get_or_create(
    name="Server Overview",
    defaults={
        "description": "Quick overview of a server's network, environment, and ownership",
        "root_model": "infrastructure.Server",
        "is_global": True,
        "owner": admin,
        "steps": {
            "rootStepId": "root",
            "stepsById": {
                "root": {
                    "id": "root",
                    "parentId": None,
                    "childIds": ["subnet", "env", "bg"],
                    "relationship": None,
                    "resolvedModelId": "infrastructure.Server",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Server",
                },
                "subnet": {
                    "id": "subnet",
                    "parentId": "root",
                    "childIds": ["network"],
                    "relationship": "subnet",
                    "resolvedModelId": "infrastructure.Subnet",
                    "visibility": "hidden",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": None,
                },
                "network": {
                    "id": "network",
                    "parentId": "subnet",
                    "childIds": [],
                    "relationship": "network",
                    "resolvedModelId": "infrastructure.Network",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "VPC / Network",
                },
                "env": {
                    "id": "env",
                    "parentId": "root",
                    "childIds": [],
                    "relationship": "environment",
                    "resolvedModelId": "infrastructure.Environment",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Environment",
                },
                "bg": {
                    "id": "bg",
                    "parentId": "root",
                    "childIds": [],
                    "relationship": "business_group",
                    "resolvedModelId": "infrastructure.BusinessGroup",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Business Group",
                },
            },
        },
    },
)
if not server_overview.draft_version:
    version = GenerationTemplateVersion.objects.create(
        template=server_overview,
        version_number=1,
        root_model=server_overview.root_model,
        definition=server_overview.steps,
        layout_settings=server_overview.layout_settings,
        created_by=admin,
    )
    server_overview.draft_version = version
    server_overview.save(update_fields=["draft_version"])
print("✓ Created generation template: Server Overview")

# ---------------------------------------------------------------------------
# Generation Template 2: "Full Network Stack"
#
# Starts from a Server, walks the full network path including
# the subnet (visible this time), network, and region up to provider.
# Also branches to security groups from the network.
#
#   Server (visible)
#     ├─ subnet (visible)
#     │    └─ network (visible)
#     │         ├─ region (visible)
#     │         │    └─ provider (visible)
#     │         └─ security_groups (visible)  [reverse relation]
#     └─ template (visible)  [ServerTemplate - the AMI/image]
# ---------------------------------------------------------------------------

full_network_stack, _ = GenerationTemplate.objects.get_or_create(
    name="Full Network Stack",
    defaults={
        "description": "Complete network topology from server to cloud provider",
        "root_model": "infrastructure.Server",
        "is_global": True,
        "owner": admin,
        "steps": {
            "rootStepId": "root",
            "stepsById": {
                "root": {
                    "id": "root",
                    "parentId": None,
                    "childIds": ["subnet", "tpl"],
                    "relationship": None,
                    "resolvedModelId": "infrastructure.Server",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Server",
                },
                "subnet": {
                    "id": "subnet",
                    "parentId": "root",
                    "childIds": ["network"],
                    "relationship": "subnet",
                    "resolvedModelId": "infrastructure.Subnet",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Subnet",
                },
                "network": {
                    "id": "network",
                    "parentId": "subnet",
                    "childIds": ["region", "secgrp"],
                    "relationship": "network",
                    "resolvedModelId": "infrastructure.Network",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "VPC / Network",
                },
                "region": {
                    "id": "region",
                    "parentId": "network",
                    "childIds": ["provider"],
                    "relationship": "region",
                    "resolvedModelId": "infrastructure.Region",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Region",
                },
                "provider": {
                    "id": "provider",
                    "parentId": "region",
                    "childIds": [],
                    "relationship": "provider",
                    "resolvedModelId": "infrastructure.CloudProvider",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Cloud Provider",
                },
                "secgrp": {
                    "id": "secgrp",
                    "parentId": "network",
                    "childIds": [],
                    "relationship": "security_groups",
                    "resolvedModelId": "infrastructure.SecurityGroup",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Security Groups",
                },
                "tpl": {
                    "id": "tpl",
                    "parentId": "root",
                    "childIds": [],
                    "relationship": "template",
                    "resolvedModelId": "infrastructure.ServerTemplate",
                    "visibility": "visible",
                    "groupMode": "none",
                    "styleTemplateId": None,
                    "label": "Server Image",
                },
            },
        },
    },
)
if not full_network_stack.draft_version:
    version = GenerationTemplateVersion.objects.create(
        template=full_network_stack,
        version_number=1,
        root_model=full_network_stack.root_model,
        definition=full_network_stack.steps,
        layout_settings=full_network_stack.layout_settings,
        created_by=admin,
    )
    full_network_stack.draft_version = version
    full_network_stack.save(update_fields=["draft_version"])
print("✓ Created generation template: Full Network Stack")

print("\n✅ Generation templates created successfully!")
