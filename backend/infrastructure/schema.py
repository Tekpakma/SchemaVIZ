import graphene
from graphene_django import DjangoObjectType
from .models import (
    CloudProvider,
    Region,
    BusinessGroup,
    Environment,
    Network,
    Subnet,
    ServerTemplate,
    Server,
    LoadBalancer,
    SecurityGroup,
    SecurityRule,
    MonitoringAlert,
)
from django.contrib.auth.models import User


class UserType(DjangoObjectType):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "managed_groups",
            "servers",
        )


class CloudProviderType(DjangoObjectType):
    class Meta:
        model = CloudProvider
        fields = "__all__"


class RegionType(DjangoObjectType):
    class Meta:
        model = Region
        fields = "__all__"


class BusinessGroupType(DjangoObjectType):
    class Meta:
        model = BusinessGroup
        fields = "__all__"


class EnvironmentType(DjangoObjectType):
    class Meta:
        model = Environment
        fields = "__all__"


class NetworkType(DjangoObjectType):
    class Meta:
        model = Network
        fields = "__all__"


class SubnetType(DjangoObjectType):
    class Meta:
        model = Subnet
        fields = "__all__"


class ServerTemplateType(DjangoObjectType):
    class Meta:
        model = ServerTemplate
        fields = "__all__"


class ServerType(DjangoObjectType):
    class Meta:
        model = Server
        fields = "__all__"


class LoadBalancerType(DjangoObjectType):
    class Meta:
        model = LoadBalancer
        fields = "__all__"


class SecurityGroupType(DjangoObjectType):
    class Meta:
        model = SecurityGroup
        fields = "__all__"


class SecurityRuleType(DjangoObjectType):
    class Meta:
        model = SecurityRule
        fields = "__all__"


class MonitoringAlertType(DjangoObjectType):
    class Meta:
        model = MonitoringAlert
        fields = "__all__"


class Query(graphene.ObjectType):
    # Cloud Provider
    all_cloud_providers = graphene.List(CloudProviderType)
    cloud_provider = graphene.Field(CloudProviderType, id=graphene.Int())

    # Regions
    all_regions = graphene.List(RegionType)

    # Business Groups
    all_business_groups = graphene.List(BusinessGroupType)

    # Environments
    all_environments = graphene.List(EnvironmentType)

    # Networks
    all_networks = graphene.List(NetworkType)

    # Servers
    all_servers = graphene.List(ServerType)
    server = graphene.Field(ServerType, id=graphene.Int())

    # Load Balancers
    all_load_balancers = graphene.List(LoadBalancerType)

    # Security
    all_security_groups = graphene.List(SecurityGroupType)

    # Monitoring
    all_alerts = graphene.List(MonitoringAlertType)

    def resolve_all_cloud_providers(self, info):
        return CloudProvider.objects.all()

    def resolve_cloud_provider(self, info, id):
        return CloudProvider.objects.get(pk=id)

    def resolve_all_regions(self, info):
        return Region.objects.all()

    def resolve_all_business_groups(self, info):
        return BusinessGroup.objects.all()

    def resolve_all_environments(self, info):
        return Environment.objects.all()

    def resolve_all_networks(self, info):
        return Network.objects.all()

    def resolve_all_servers(self, info):
        return Server.objects.all()

    def resolve_server(self, info, id):
        return Server.objects.get(pk=id)

    def resolve_all_load_balancers(self, info):
        return LoadBalancer.objects.all()

    def resolve_all_security_groups(self, info):
        return SecurityGroup.objects.all()

    def resolve_all_alerts(self, info):
        return MonitoringAlert.objects.all()
