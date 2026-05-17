from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

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
    Subnet,
)

User = get_user_model()


class GenerateFakeInfraCommandTests(TestCase):
    def run_generate(self, **overrides):
        options = {
            "label": "test-bench",
            "profile": "smoke",
            "seed": 123,
            "batch_size": 25,
            "providers": 1,
            "regions_per_provider": 1,
            "users": 2,
            "business_groups": 1,
            "environments_per_group": 2,
            "networks_per_environment": 1,
            "subnets_per_network": 2,
            "servers_per_subnet": 3,
            "alerts_per_server": 2,
            "security_groups_per_network": 1,
            "rules_per_security_group": 2,
            "load_balancers_per_environment": 1,
        }
        options.update(overrides)
        call_command("generate_fake_infra", stdout=StringIO(), **options)

    def test_generate_fake_infra_creates_expected_dataset(self):
        self.run_generate()

        self.assertEqual(User.objects.filter(username__startswith="test-bench-").count(), 2)
        self.assertEqual(CloudProvider.objects.filter(slug__startswith="test-bench-").count(), 1)
        self.assertEqual(Region.objects.filter(code__startswith="test-bench-").count(), 1)
        self.assertEqual(BusinessGroup.objects.filter(name__startswith="test-bench-").count(), 1)
        self.assertEqual(Environment.objects.filter(name__startswith="test-bench-").count(), 2)
        self.assertEqual(Network.objects.filter(name__startswith="test-bench-").count(), 2)
        self.assertEqual(Subnet.objects.filter(name__startswith="test-bench-").count(), 4)
        self.assertEqual(Server.objects.filter(hostname__startswith="test-bench-").count(), 12)
        self.assertEqual(SecurityGroup.objects.filter(name__startswith="test-bench-").count(), 2)
        self.assertEqual(
            SecurityRule.objects.filter(security_group__name__startswith="test-bench-").count(),
            4,
        )
        self.assertEqual(LoadBalancer.objects.filter(name__startswith="test-bench-").count(), 2)
        self.assertEqual(
            MonitoringAlert.objects.filter(server__hostname__startswith="test-bench-").count(),
            24,
        )

    def test_generate_fake_infra_links_each_business_group_to_each_provider(self):
        self.run_generate(
            providers=4,
            regions_per_provider=2,
            users=4,
            business_groups=3,
            environments_per_group=4,
            networks_per_environment=1,
            subnets_per_network=1,
            servers_per_subnet=1,
            alerts_per_server=0,
            security_groups_per_network=0,
            rules_per_security_group=0,
            load_balancers_per_environment=0,
        )

        provider_slugs = set(
            CloudProvider.objects.filter(slug__startswith="test-bench-").values_list(
                "slug",
                flat=True,
            )
        )
        self.assertEqual(len(provider_slugs), 4)

        for group in BusinessGroup.objects.filter(name__startswith="test-bench-"):
            related_provider_slugs = set(
                group.networks.values_list("region__provider__slug", flat=True)
            )
            self.assertEqual(related_provider_slugs, provider_slugs)

    def test_generate_fake_infra_requires_replace_for_existing_label(self):
        self.run_generate()

        with self.assertRaises(CommandError):
            self.run_generate()

    def test_generate_fake_infra_replace_rebuilds_dataset(self):
        self.run_generate()
        self.run_generate(
            replace=True,
            users=1,
            environments_per_group=1,
            subnets_per_network=1,
            servers_per_subnet=1,
            alerts_per_server=0,
            rules_per_security_group=1,
        )

        self.assertEqual(User.objects.filter(username__startswith="test-bench-").count(), 1)
        self.assertEqual(Environment.objects.filter(name__startswith="test-bench-").count(), 1)
        self.assertEqual(Subnet.objects.filter(name__startswith="test-bench-").count(), 1)
        self.assertEqual(Server.objects.filter(hostname__startswith="test-bench-").count(), 1)
        self.assertEqual(
            MonitoringAlert.objects.filter(server__hostname__startswith="test-bench-").count(),
            0,
        )
