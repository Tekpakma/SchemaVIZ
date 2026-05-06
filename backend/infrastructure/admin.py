from django.contrib import admin

# Register your models here.
from django.contrib import admin
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


@admin.register(CloudProvider)
class CloudProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "provider", "location")
    list_filter = ("provider",)
    search_fields = ("name", "code", "location")


@admin.register(BusinessGroup)
class BusinessGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "cost_center", "manager", "parent", "created_at")
    list_filter = ("manager",)
    search_fields = ("name", "description", "cost_center")
    raw_id_fields = ("manager", "parent")


@admin.register(Environment)
class EnvironmentAdmin(admin.ModelAdmin):
    list_display = ("name", "env_type", "business_group")
    list_filter = ("env_type", "business_group")
    search_fields = ("name",)


@admin.register(Network)
class NetworkAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "cidr_block",
        "region",
        "environment",
        "business_group",
        "is_active",
        "created_at",
    )
    list_filter = ("region", "environment", "business_group", "is_active")
    search_fields = ("name", "cidr_block")


@admin.register(Subnet)
class SubnetAdmin(admin.ModelAdmin):
    list_display = ("name", "cidr_block", "subnet_type", "network", "availability_zone")
    list_filter = ("subnet_type", "network")
    search_fields = ("name", "cidr_block")


@admin.register(ServerTemplate)
class ServerTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "os_family", "os_version", "provider", "image_id")
    list_filter = ("os_family", "provider")
    search_fields = ("name", "image_id")


@admin.register(Server)
class ServerAdmin(admin.ModelAdmin):
    list_display = (
        "hostname",
        "ip_address",
        "instance_type",
        "status",
        "environment",
        "business_group",
        "created_at",
    )
    list_filter = ("status", "environment", "business_group", "subnet__network")
    search_fields = ("hostname", "ip_address")
    raw_id_fields = ("owner",)
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        (
            "Basic Information",
            {"fields": ("hostname", "ip_address", "instance_type", "status")},
        ),
        (
            "Relationships",
            {
                "fields": (
                    "subnet",
                    "template",
                    "environment",
                    "business_group",
                    "owner",
                )
            },
        ),
        ("Metadata", {"fields": ("tags", "created_at", "updated_at")}),
    )


@admin.register(LoadBalancer)
class LoadBalancerAdmin(admin.ModelAdmin):
    list_display = ("name", "dns_name", "subnet", "environment", "is_active")
    list_filter = ("environment", "is_active")
    search_fields = ("name", "dns_name")
    filter_horizontal = ("servers",)


@admin.register(SecurityGroup)
class SecurityGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "network", "server_count")
    list_filter = ("network",)
    search_fields = ("name", "description")
    filter_horizontal = ("servers",)

    def server_count(self, obj):
        return obj.servers.count()

    server_count.short_description = "Servers"


class SecurityRuleInline(admin.TabularInline):
    model = SecurityRule
    extra = 1


@admin.register(SecurityRule)
class SecurityRuleAdmin(admin.ModelAdmin):
    list_display = (
        "security_group",
        "direction",
        "protocol",
        "port_range",
        "source_cidr",
    )
    list_filter = ("direction", "protocol", "security_group")
    search_fields = ("description", "source_cidr")


@admin.register(MonitoringAlert)
class MonitoringAlertAdmin(admin.ModelAdmin):
    list_display = (
        "server",
        "severity",
        "message_preview",
        "is_resolved",
        "created_at",
    )
    list_filter = ("severity", "is_resolved", "created_at")
    search_fields = ("message", "server__hostname")
    readonly_fields = ("created_at",)

    def message_preview(self, obj):
        return obj.message[:50] + "..." if len(obj.message) > 50 else obj.message

    message_preview.short_description = "Message"
