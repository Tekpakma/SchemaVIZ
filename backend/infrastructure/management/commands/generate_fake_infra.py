from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, fields, replace
from datetime import timedelta
from random import Random
from typing import Iterable

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from faker import Faker

from infrastructure.models import (
    BusinessGroup,
    CloudProvider,
    Environment,
    LoadBalancer,
    MonitoringAlert,
    Network,
    Region,
    SecurityGroup,
    SecurityRule,
    Server,
    ServerTemplate,
    Subnet,
)

User = get_user_model()

TEMPLATE_BLUEPRINTS = (
    ("Ubuntu 22.04 LTS", "Linux", "22.04"),
    ("Debian 12", "Linux", "12"),
)
PROVIDER_BLUEPRINTS = (
    {
        "slug": "aws",
        "name": "Amazon Web Services",
        "endpoint": "https://aws.amazon.com",
        "instance_types": ("t3.small", "t3.medium", "m6i.large"),
    },
    {
        "slug": "azure",
        "name": "Microsoft Azure",
        "endpoint": "https://azure.microsoft.com",
        "instance_types": ("B2ms", "D2s_v5", "D4s_v5"),
    },
    {
        "slug": "gcp",
        "name": "Google Cloud Platform",
        "endpoint": "https://cloud.google.com",
        "instance_types": ("e2-standard-2", "n2-standard-4", "c3-standard-4"),
    },
    {
        "slug": "oci",
        "name": "Oracle Cloud Infrastructure",
        "endpoint": "https://www.oracle.com/cloud/",
        "instance_types": ("VM.Standard.E4.Flex", "VM.Standard3.Flex"),
    },
)
ROLE_NAMES = ("web", "api", "worker", "batch", "search", "cache")
ALERT_MESSAGES = (
    "CPU saturation detected",
    "Memory pressure detected",
    "Disk latency above threshold",
    "Packet loss above threshold",
    "Error rate above threshold",
)
RULE_BLUEPRINTS = (
    ("inbound", "tcp", "80", "0.0.0.0/0", "Allow HTTP"),
    ("inbound", "tcp", "443", "0.0.0.0/0", "Allow HTTPS"),
    ("inbound", "tcp", "22", "10.0.0.0/8", "Allow SSH"),
    ("outbound", "tcp", "443", "0.0.0.0/0", "Allow HTTPS egress"),
    ("outbound", "udp", "53", "0.0.0.0/0", "Allow DNS"),
)


@dataclass(frozen=True)
class DatasetPlan:
    providers: int
    regions_per_provider: int
    users: int
    business_groups: int
    environments_per_group: int
    networks_per_environment: int
    subnets_per_network: int
    servers_per_subnet: int
    alerts_per_server: int
    security_groups_per_network: int
    rules_per_security_group: int
    load_balancers_per_environment: int

    def total_environments(self) -> int:
        return self.business_groups * self.environments_per_group

    def total_networks(self) -> int:
        return self.total_environments() * self.networks_per_environment

    def total_subnets(self) -> int:
        return self.total_networks() * self.subnets_per_network

    def total_servers(self) -> int:
        return self.total_subnets() * self.servers_per_subnet

    def total_alerts(self) -> int:
        return self.total_servers() * self.alerts_per_server

    def total_security_groups(self) -> int:
        return self.total_networks() * self.security_groups_per_network

    def total_security_rules(self) -> int:
        return self.total_security_groups() * self.rules_per_security_group

    def total_load_balancers(self) -> int:
        return self.total_environments() * self.load_balancers_per_environment


PROFILE_PRESETS = {
    "smoke": DatasetPlan(
        providers=2,
        regions_per_provider=2,
        users=5,
        business_groups=2,
        environments_per_group=2,
        networks_per_environment=1,
        subnets_per_network=2,
        servers_per_subnet=6,
        alerts_per_server=1,
        security_groups_per_network=1,
        rules_per_security_group=3,
        load_balancers_per_environment=1,
    ),
    "pagination": DatasetPlan(
        providers=3,
        regions_per_provider=4,
        users=30,
        business_groups=12,
        environments_per_group=4,
        networks_per_environment=2,
        subnets_per_network=3,
        servers_per_subnet=120,
        alerts_per_server=2,
        security_groups_per_network=2,
        rules_per_security_group=4,
        load_balancers_per_environment=2,
    ),
    "stress": DatasetPlan(
        providers=3,
        regions_per_provider=6,
        users=60,
        business_groups=18,
        environments_per_group=4,
        networks_per_environment=3,
        subnets_per_network=3,
        servers_per_subnet=150,
        alerts_per_server=3,
        security_groups_per_network=3,
        rules_per_security_group=5,
        load_balancers_per_environment=2,
    ),
}
PLAN_FIELD_NAMES = tuple(field.name for field in fields(DatasetPlan))
CORE_PLAN_FIELDS = {
    "providers",
    "regions_per_provider",
    "users",
    "business_groups",
    "environments_per_group",
    "networks_per_environment",
    "subnets_per_network",
    "servers_per_subnet",
}


class Command(BaseCommand):
    help = "Generate large fake infrastructure datasets for pagination and benchmark testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--label",
            default="benchmark",
            help="Dataset label used as a prefix on generated records.",
        )
        parser.add_argument(
            "--profile",
            choices=sorted(PROFILE_PRESETS),
            default="pagination",
            help="Preset dataset size to start from.",
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Delete an existing dataset with the same label before regenerating it.",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=20260303,
            help="Seed for Faker and deterministic relationship choices.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=1000,
            help="Bulk insert batch size.",
        )

        for field_name in PLAN_FIELD_NAMES:
            parser.add_argument(
                f"--{field_name.replace('_', '-')}",
                type=int,
                default=None,
                help=f"Override {field_name.replace('_', ' ')} from the selected profile.",
            )

    def handle(self, *args, **options):
        label = slugify(options["label"])
        if not label:
            raise CommandError("Label must contain at least one alphanumeric character.")

        batch_size = options["batch_size"]
        if batch_size < 1:
            raise CommandError("batch-size must be at least 1.")

        plan = self._build_plan(options)
        prefix = f"{label}-"

        if self._dataset_exists(prefix):
            if not options["replace"]:
                raise CommandError(
                    f'Dataset "{label}" already exists. Use --replace or choose a different --label.'
                )
            self.stdout.write(f'Removing existing dataset "{label}"...')
            self._delete_dataset(prefix)

        self._print_plan(label, plan)

        rng = Random(options["seed"])
        fake = Faker()
        fake.seed_instance(options["seed"])

        with transaction.atomic():
            self._create_dataset(
                label=label,
                prefix=prefix,
                plan=plan,
                fake=fake,
                rng=rng,
                batch_size=batch_size,
            )

        summary = self._collect_summary(prefix)
        self.stdout.write(self.style.SUCCESS(f'Dataset "{label}" is ready.'))
        for key, value in summary.items():
            self.stdout.write(f"  {key}: {value}")

    def _build_plan(self, options) -> DatasetPlan:
        plan = PROFILE_PRESETS[options["profile"]]
        overrides = {
            field_name: options[field_name]
            for field_name in PLAN_FIELD_NAMES
            if options[field_name] is not None
        }
        if overrides:
            plan = replace(plan, **overrides)

        for field_name in PLAN_FIELD_NAMES:
            value = getattr(plan, field_name)
            minimum = 1 if field_name in CORE_PLAN_FIELDS else 0
            if value < minimum:
                raise CommandError(f"{field_name.replace('_', '-')} must be at least {minimum}.")

        return plan

    def _print_plan(self, label: str, plan: DatasetPlan) -> None:
        self.stdout.write(f'Generating dataset "{label}" with profile:')
        self.stdout.write(
            "  "
            f"providers={plan.providers}, regions={plan.providers * plan.regions_per_provider}, "
            f"groups={plan.business_groups}, environments={plan.total_environments()}, "
            f"networks={plan.total_networks()}, subnets={plan.total_subnets()}, "
            f"servers={plan.total_servers()}, alerts={plan.total_alerts()}"
        )

    def _dataset_exists(self, prefix: str) -> bool:
        return (
            User.objects.filter(username__startswith=prefix).exists()
            or CloudProvider.objects.filter(slug__startswith=prefix).exists()
            or Server.objects.filter(hostname__startswith=prefix).exists()
        )

    def _delete_dataset(self, prefix: str) -> None:
        MonitoringAlert.objects.filter(server__hostname__startswith=prefix).delete()
        LoadBalancer.objects.filter(name__startswith=prefix).delete()
        SecurityRule.objects.filter(security_group__name__startswith=prefix).delete()
        SecurityGroup.objects.filter(name__startswith=prefix).delete()
        Server.objects.filter(hostname__startswith=prefix).delete()
        Subnet.objects.filter(name__startswith=prefix).delete()
        Network.objects.filter(name__startswith=prefix).delete()
        Environment.objects.filter(name__startswith=prefix).delete()
        BusinessGroup.objects.filter(name__startswith=prefix).delete()
        ServerTemplate.objects.filter(name__startswith=prefix).delete()
        Region.objects.filter(code__startswith=prefix).delete()
        CloudProvider.objects.filter(slug__startswith=prefix).delete()
        User.objects.filter(username__startswith=prefix).delete()

    def _create_dataset(
        self,
        *,
        label: str,
        prefix: str,
        plan: DatasetPlan,
        fake: Faker,
        rng: Random,
        batch_size: int,
    ) -> None:
        users = self._create_users(prefix, plan, fake, batch_size)
        providers = self._create_providers(prefix, plan, batch_size)
        regions = self._create_regions(prefix, providers, plan, fake, batch_size)
        groups = self._create_business_groups(prefix, users, plan, fake, rng, batch_size)
        environments = self._create_environments(prefix, groups, plan, batch_size)
        templates = self._create_templates(prefix, providers, batch_size)
        networks = self._create_networks(prefix, environments, regions, plan, batch_size)
        subnets = self._create_subnets(prefix, networks, plan, batch_size)
        servers = self._create_servers(
            label=label,
            prefix=prefix,
            subnets=subnets,
            users=users,
            templates=templates,
            plan=plan,
            fake=fake,
            rng=rng,
            batch_size=batch_size,
        )
        security_groups = self._create_security_groups(prefix, networks, plan, batch_size)
        self._attach_security_groups(security_groups, servers, batch_size)
        self._create_security_rules(security_groups, plan, batch_size)
        load_balancers = self._create_load_balancers(prefix, environments, subnets, plan, batch_size)
        self._attach_load_balancers(load_balancers, servers, batch_size)
        self._create_alerts(servers, plan, fake, rng, batch_size)

    def _create_users(
        self, prefix: str, plan: DatasetPlan, fake: Faker, batch_size: int
    ) -> list:
        unusable_password = make_password(None)
        users = []
        for index in range(plan.users):
            users.append(
                User(
                    username=f"{prefix}user-{index:05d}",
                    email=f"{prefix}user-{index:05d}@example.test",
                    first_name=fake.first_name(),
                    last_name=fake.last_name(),
                    password=unusable_password,
                    is_staff=index == 0,
                )
            )

        User.objects.bulk_create(users, batch_size=batch_size)
        return list(User.objects.filter(username__startswith=prefix).order_by("username"))

    def _create_providers(self, prefix: str, plan: DatasetPlan, batch_size: int) -> list:
        providers = []
        blueprints = list(PROVIDER_BLUEPRINTS[: plan.providers])
        if len(blueprints) < plan.providers:
            for index in range(len(blueprints), plan.providers):
                blueprints.append(
                    {
                        "slug": f"provider-{index:02d}",
                        "name": f"Benchmark Provider {index:02d}",
                        "endpoint": f"https://provider-{index:02d}.example.test",
                        "instance_types": ("standard.small", "standard.medium"),
                    }
                )

        for blueprint in blueprints:
            providers.append(
                CloudProvider(
                    name=f"{prefix}{blueprint['name']}",
                    slug=f"{prefix}{blueprint['slug']}",
                    api_endpoint=blueprint["endpoint"],
                )
            )

        CloudProvider.objects.bulk_create(providers, batch_size=batch_size)
        return list(
            CloudProvider.objects.filter(slug__startswith=prefix).order_by("slug")
        )

    def _create_regions(
        self,
        prefix: str,
        providers: list,
        plan: DatasetPlan,
        fake: Faker,
        batch_size: int,
    ) -> list:
        regions = []
        for provider in providers:
            provider_suffix = provider.slug.removeprefix(prefix)
            for index in range(plan.regions_per_provider):
                region_code = f"{prefix}{provider_suffix}-region-{index:02d}"
                regions.append(
                    Region(
                        provider=provider,
                        name=f"{provider_suffix.upper()} Region {index:02d}",
                        code=region_code,
                        location=f"{fake.city()}, {fake.country()}",
                    )
                )

        Region.objects.bulk_create(regions, batch_size=batch_size)
        return list(
            Region.objects.filter(code__startswith=prefix)
            .select_related("provider")
            .order_by("code")
        )

    def _create_business_groups(
        self,
        prefix: str,
        users: list,
        plan: DatasetPlan,
        fake: Faker,
        rng: Random,
        batch_size: int,
    ) -> list:
        groups = []
        for index in range(plan.business_groups):
            groups.append(
                BusinessGroup(
                    name=f"{prefix}group-{index:04d}-{slugify(fake.bs())[:24]}",
                    description=fake.sentence(nb_words=10),
                    cost_center=f"{prefix.upper()[:6]}-{index:04d}",
                    manager=rng.choice(users),
                )
            )

        BusinessGroup.objects.bulk_create(groups, batch_size=batch_size)
        return list(
            BusinessGroup.objects.filter(name__startswith=prefix)
            .select_related("manager")
            .order_by("name")
        )

    def _create_environments(self, prefix: str, groups: list, plan: DatasetPlan, batch_size: int) -> list:
        env_codes = [value for value, _ in Environment.ENVIRONMENT_TYPES]
        environments = []
        for group_index, group in enumerate(groups):
            for env_index in range(plan.environments_per_group):
                env_type = env_codes[env_index % len(env_codes)]
                environments.append(
                    Environment(
                        name=f"{prefix}{env_type}-{group_index:04d}-{env_index:02d}",
                        env_type=env_type,
                        business_group=group,
                    )
                )

        Environment.objects.bulk_create(environments, batch_size=batch_size)
        return list(
            Environment.objects.filter(name__startswith=prefix)
            .select_related("business_group")
            .order_by("name")
        )

    def _create_templates(self, prefix: str, providers: list, batch_size: int) -> list:
        templates = []
        for provider in providers:
            provider_key = provider.slug.removeprefix(prefix)
            for index, (name, os_family, os_version) in enumerate(TEMPLATE_BLUEPRINTS):
                templates.append(
                    ServerTemplate(
                        name=f"{prefix}{provider_key}-{slugify(name)}-{index:02d}",
                        os_family=os_family,
                        os_version=os_version,
                        provider=provider,
                        image_id=f"{prefix}{provider_key}-img-{index:02d}",
                    )
                )

        ServerTemplate.objects.bulk_create(templates, batch_size=batch_size)
        return list(
            ServerTemplate.objects.filter(name__startswith=prefix)
            .select_related("provider")
            .order_by("name")
        )

    def _create_networks(
        self,
        prefix: str,
        environments: list,
        regions: list,
        plan: DatasetPlan,
        batch_size: int,
    ) -> list:
        networks = []
        for env_index, environment in enumerate(environments):
            for network_index in range(plan.networks_per_environment):
                region = regions[(env_index + network_index) % len(regions)]
                cidr_octet = (env_index * plan.networks_per_environment + network_index) % 256
                networks.append(
                    Network(
                        name=f"{prefix}network-{env_index:04d}-{network_index:02d}",
                        cidr_block=f"10.{cidr_octet}.0.0/16",
                        region=region,
                        environment=environment,
                        business_group=environment.business_group,
                        is_active=True,
                    )
                )

        Network.objects.bulk_create(networks, batch_size=batch_size)
        return list(
            Network.objects.filter(name__startswith=prefix)
            .select_related("region__provider", "environment__business_group")
            .order_by("name")
        )

    def _create_subnets(self, prefix: str, networks: list, plan: DatasetPlan, batch_size: int) -> list:
        subnet_types = [value for value, _ in Subnet.SUBNET_TYPES]
        subnets = []
        for network_index, network in enumerate(networks):
            second_octet = network_index % 256
            for subnet_index in range(plan.subnets_per_network):
                subnets.append(
                    Subnet(
                        name=f"{prefix}subnet-{network_index:05d}-{subnet_index:02d}",
                        cidr_block=f"10.{second_octet}.{subnet_index}.0/24",
                        subnet_type=subnet_types[subnet_index % len(subnet_types)],
                        network=network,
                        availability_zone=f"{network.region.code}-az{subnet_index + 1}",
                    )
                )

        Subnet.objects.bulk_create(subnets, batch_size=batch_size)
        return list(
            Subnet.objects.filter(name__startswith=prefix)
            .select_related(
                "network__region__provider",
                "network__environment__business_group",
            )
            .order_by("name")
        )

    def _create_servers(
        self,
        *,
        label: str,
        prefix: str,
        subnets: list,
        users: list,
        templates: list,
        plan: DatasetPlan,
        fake: Faker,
        rng: Random,
        batch_size: int,
    ) -> list:
        status_values = [value for value, _ in Server.STATUS_CHOICES]
        templates_by_provider_id = defaultdict(list)
        for template in templates:
            templates_by_provider_id[template.provider_id].append(template)

        now = timezone.now()
        buffer: list[Server] = []
        created = 0

        for subnet_index, subnet in enumerate(subnets):
            provider_templates = templates_by_provider_id[subnet.network.region.provider_id]
            for server_index in range(plan.servers_per_subnet):
                created_at = now - timedelta(
                    days=(subnet_index + server_index) % 30,
                    minutes=(subnet_index * 17 + server_index * 3) % 1440,
                )
                status = status_values[(subnet_index + server_index) % len(status_values)]
                role = ROLE_NAMES[(subnet_index + server_index) % len(ROLE_NAMES)]
                buffer.append(
                    Server(
                        hostname=f"{prefix}srv-{subnet_index:06d}-{server_index:03d}",
                        ip_address=f"10.{subnet_index % 256}.{subnet_index % 200}.{(server_index % 250) + 1}",
                        instance_type=rng.choice(
                            self._provider_instance_types(
                                subnet.network.region.provider.slug.removeprefix(prefix)
                            )
                        ),
                        status=status,
                        subnet=subnet,
                        template=rng.choice(provider_templates),
                        environment=subnet.network.environment,
                        business_group=subnet.network.business_group,
                        owner=rng.choice(users),
                        tags={
                            "dataset": label,
                            "role": role,
                            "tier": fake.word(ext_word_list=["edge", "core", "data"]),
                        },
                        created_at=created_at,
                        updated_at=created_at + timedelta(minutes=15),
                    )
                )

                if len(buffer) >= batch_size:
                    Server.objects.bulk_create(buffer, batch_size=batch_size)
                    created += len(buffer)
                    buffer.clear()

        if buffer:
            Server.objects.bulk_create(buffer, batch_size=batch_size)
            created += len(buffer)

        self.stdout.write(f"  created servers: {created}")
        return list(
            Server.objects.filter(hostname__startswith=prefix)
            .select_related(
                "subnet__network__environment",
                "subnet__network__business_group",
                "subnet__network__region__provider",
                "template",
            )
            .order_by("hostname")
        )

    def _create_security_groups(
        self, prefix: str, networks: list, plan: DatasetPlan, batch_size: int
    ) -> list:
        groups = []
        for network_index, network in enumerate(networks):
            for security_group_index in range(plan.security_groups_per_network):
                groups.append(
                    SecurityGroup(
                        name=f"{prefix}sg-{network_index:05d}-{security_group_index:02d}",
                        description=f"Security group {security_group_index:02d} for {network.name}",
                        network=network,
                    )
                )

        SecurityGroup.objects.bulk_create(groups, batch_size=batch_size)
        return list(
            SecurityGroup.objects.filter(name__startswith=prefix)
            .select_related("network")
            .order_by("name")
        )

    def _attach_security_groups(
        self, security_groups: list, servers: list, batch_size: int
    ) -> None:
        if not security_groups or not servers:
            return

        servers_by_network_id = defaultdict(list)
        for server in servers:
            servers_by_network_id[server.subnet.network_id].append(server)

        through_model = SecurityGroup.servers.through
        sg_field_name = self._through_field_name(through_model, SecurityGroup)
        server_field_name = self._through_field_name(through_model, Server)
        attachments = []

        for sg_index, security_group in enumerate(security_groups):
            candidates = servers_by_network_id[security_group.network_id]
            for server in self._pick_related_records(candidates, desired_count=12, offset=sg_index):
                attachments.append(
                    through_model(
                        **{
                            sg_field_name: security_group.id,
                            server_field_name: server.id,
                        }
                    )
                )

        through_model.objects.bulk_create(
            attachments,
            batch_size=batch_size,
            ignore_conflicts=True,
        )

    def _create_security_rules(
        self, security_groups: list, plan: DatasetPlan, batch_size: int
    ) -> None:
        if plan.rules_per_security_group == 0:
            return

        rules = []
        for sg_index, security_group in enumerate(security_groups):
            for rule_index in range(plan.rules_per_security_group):
                direction, protocol, port_range, source_cidr, description = RULE_BLUEPRINTS[
                    rule_index % len(RULE_BLUEPRINTS)
                ]
                rules.append(
                    SecurityRule(
                        security_group=security_group,
                        direction=direction,
                        protocol=protocol,
                        port_range=port_range,
                        source_cidr=source_cidr,
                        description=f"{description} #{sg_index:04d}",
                    )
                )

        SecurityRule.objects.bulk_create(rules, batch_size=batch_size)

    def _create_load_balancers(
        self,
        prefix: str,
        environments: list,
        subnets: list,
        plan: DatasetPlan,
        batch_size: int,
    ) -> list:
        if plan.load_balancers_per_environment == 0:
            return []

        public_subnets_by_environment_id = defaultdict(list)
        for subnet in subnets:
            if subnet.subnet_type == "public":
                public_subnets_by_environment_id[subnet.network.environment_id].append(subnet)

        load_balancers = []
        for env_index, environment in enumerate(environments):
            candidates = public_subnets_by_environment_id[environment.id]
            if not candidates:
                continue

            for lb_index in range(plan.load_balancers_per_environment):
                subnet = candidates[lb_index % len(candidates)]
                name = f"{prefix}lb-{env_index:04d}-{lb_index:02d}"
                load_balancers.append(
                    LoadBalancer(
                        name=name,
                        dns_name=f"{name}.example.test",
                        subnet=subnet,
                        environment=environment,
                        is_active=True,
                    )
                )

        LoadBalancer.objects.bulk_create(load_balancers, batch_size=batch_size)
        return list(
            LoadBalancer.objects.filter(name__startswith=prefix)
            .select_related("environment", "subnet")
            .order_by("name")
        )

    def _attach_load_balancers(
        self, load_balancers: list, servers: list, batch_size: int
    ) -> None:
        if not load_balancers or not servers:
            return

        servers_by_environment_id = defaultdict(list)
        for server in servers:
            servers_by_environment_id[server.environment_id].append(server)

        through_model = LoadBalancer.servers.through
        lb_field_name = self._through_field_name(through_model, LoadBalancer)
        server_field_name = self._through_field_name(through_model, Server)
        attachments = []

        for lb_index, load_balancer in enumerate(load_balancers):
            candidates = servers_by_environment_id[load_balancer.environment_id]
            for server in self._pick_related_records(candidates, desired_count=8, offset=lb_index):
                attachments.append(
                    through_model(
                        **{
                            lb_field_name: load_balancer.id,
                            server_field_name: server.id,
                        }
                    )
                )

        through_model.objects.bulk_create(
            attachments,
            batch_size=batch_size,
            ignore_conflicts=True,
        )

    def _create_alerts(
        self,
        servers: list,
        plan: DatasetPlan,
        fake: Faker,
        rng: Random,
        batch_size: int,
    ) -> None:
        if plan.alerts_per_server == 0:
            return

        now = timezone.now()
        severities = [value for value, _ in MonitoringAlert.SEVERITY_LEVELS]
        buffer: list[MonitoringAlert] = []

        for server_index, server in enumerate(servers):
            for alert_index in range(plan.alerts_per_server):
                created_at = now - timedelta(hours=(server_index + alert_index) % 720)
                is_resolved = (server_index + alert_index) % 4 == 0
                buffer.append(
                    MonitoringAlert(
                        server=server,
                        severity=severities[(server_index + alert_index) % len(severities)],
                        message=(
                            f"{rng.choice(ALERT_MESSAGES)} on {server.hostname} "
                            f"({fake.word(ext_word_list=['cpu', 'memory', 'disk', 'network'])})"
                        ),
                        is_resolved=is_resolved,
                        created_at=created_at,
                        resolved_at=created_at + timedelta(minutes=45) if is_resolved else None,
                    )
                )

                if len(buffer) >= batch_size:
                    MonitoringAlert.objects.bulk_create(buffer, batch_size=batch_size)
                    buffer.clear()

        if buffer:
            MonitoringAlert.objects.bulk_create(buffer, batch_size=batch_size)

    def _collect_summary(self, prefix: str) -> dict[str, int]:
        return {
            "users": User.objects.filter(username__startswith=prefix).count(),
            "providers": CloudProvider.objects.filter(slug__startswith=prefix).count(),
            "regions": Region.objects.filter(code__startswith=prefix).count(),
            "business_groups": BusinessGroup.objects.filter(name__startswith=prefix).count(),
            "environments": Environment.objects.filter(name__startswith=prefix).count(),
            "networks": Network.objects.filter(name__startswith=prefix).count(),
            "subnets": Subnet.objects.filter(name__startswith=prefix).count(),
            "servers": Server.objects.filter(hostname__startswith=prefix).count(),
            "security_groups": SecurityGroup.objects.filter(name__startswith=prefix).count(),
            "security_rules": SecurityRule.objects.filter(
                security_group__name__startswith=prefix
            ).count(),
            "load_balancers": LoadBalancer.objects.filter(name__startswith=prefix).count(),
            "alerts": MonitoringAlert.objects.filter(
                server__hostname__startswith=prefix
            ).count(),
        }

    def _provider_instance_types(self, provider_key: str) -> Iterable[str]:
        for blueprint in PROVIDER_BLUEPRINTS:
            if blueprint["slug"] == provider_key:
                return blueprint["instance_types"]
        return ("standard.small", "standard.medium")

    def _pick_related_records(self, candidates: list, *, desired_count: int, offset: int) -> list:
        if not candidates or desired_count <= 0:
            return []

        start = offset % len(candidates)
        rotated = candidates[start:] + candidates[:start]
        return rotated[: min(desired_count, len(rotated))]

    def _through_field_name(self, through_model, related_model) -> str:
        for field in through_model._meta.fields:
            if getattr(field, "related_model", None) is related_model:
                return field.attname
        raise CommandError(
            f"Could not resolve through field for {through_model.__name__} -> {related_model.__name__}."
        )
