from django.db import models
from django.contrib.auth.models import User


class CloudProvider(models.Model):
    """AWS, Azure, GCP, etc."""

    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    api_endpoint = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Region(models.Model):
    """Geographic regions within a cloud provider"""

    provider = models.ForeignKey(
        CloudProvider, on_delete=models.CASCADE, related_name="regions"
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)  # e.g., eu-central-1
    location = models.CharField(max_length=200)  # e.g., Frankfurt, Germany

    class Meta:
        unique_together = ["provider", "code"]

    def __str__(self):
        return f"{self.provider.name} - {self.name}"


class BusinessGroup(models.Model):
    """Organization/Department owning resources"""

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    cost_center = models.CharField(max_length=50, blank=True)
    manager = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="managed_groups"
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subgroups",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Environment(models.Model):
    """Development, Staging, Production, etc."""

    ENVIRONMENT_TYPES = [
        ("dev", "Development"),
        ("test", "Testing"),
        ("stage", "Staging"),
        ("prod", "Production"),
    ]

    name = models.CharField(max_length=100)
    env_type = models.CharField(max_length=10, choices=ENVIRONMENT_TYPES)
    business_group = models.ForeignKey(
        BusinessGroup, on_delete=models.CASCADE, related_name="environments"
    )

    def __str__(self):
        return f"{self.business_group.name} - {self.name}"


class Network(models.Model):
    """Virtual networks/VPCs"""

    name = models.CharField(max_length=200)
    cidr_block = models.CharField(max_length=50)  # e.g., 10.0.0.0/16
    region = models.ForeignKey(
        Region, on_delete=models.CASCADE, related_name="networks"
    )
    environment = models.ForeignKey(
        Environment, on_delete=models.CASCADE, related_name="networks"
    )
    business_group = models.ForeignKey(
        BusinessGroup, on_delete=models.CASCADE, related_name="networks"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.cidr_block})"


class Subnet(models.Model):
    """Subnets within a network"""

    SUBNET_TYPES = [
        ("public", "Public"),
        ("private", "Private"),
        ("database", "Database"),
    ]

    name = models.CharField(max_length=200)
    cidr_block = models.CharField(max_length=50)
    subnet_type = models.CharField(max_length=20, choices=SUBNET_TYPES)
    network = models.ForeignKey(
        Network, on_delete=models.CASCADE, related_name="subnets"
    )
    availability_zone = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return f"{self.name} ({self.cidr_block})"


class ServerTemplate(models.Model):
    """Server templates/AMIs/images"""

    name = models.CharField(max_length=200)
    os_family = models.CharField(max_length=50)  # Linux, Windows
    os_version = models.CharField(max_length=50)
    provider = models.ForeignKey(
        CloudProvider, on_delete=models.CASCADE, related_name="templates"
    )
    image_id = models.CharField(max_length=200)

    def __str__(self):
        return f"{self.name} ({self.os_family} {self.os_version})"


class Server(models.Model):
    """Virtual machine instances"""

    STATUS_CHOICES = [
        ("running", "Running"),
        ("stopped", "Stopped"),
        ("terminated", "Terminated"),
        ("pending", "Pending"),
    ]

    hostname = models.CharField(max_length=200, unique=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    instance_type = models.CharField(max_length=50)  # t3.medium, Standard_D2s_v3, etc.
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    # Relationships
    subnet = models.ForeignKey(Subnet, on_delete=models.CASCADE, related_name="servers")
    template = models.ForeignKey(
        ServerTemplate, on_delete=models.PROTECT, related_name="servers"
    )
    environment = models.ForeignKey(
        Environment, on_delete=models.CASCADE, related_name="servers"
    )
    business_group = models.ForeignKey(
        BusinessGroup, on_delete=models.CASCADE, related_name="servers"
    )

    # Metadata
    owner = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="servers"
    )
    tags = models.JSONField(default=dict, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["hostname"]

    def __str__(self):
        return self.hostname


class LoadBalancer(models.Model):
    """Load balancers"""

    name = models.CharField(max_length=200)
    dns_name = models.CharField(max_length=500, blank=True)
    subnet = models.ForeignKey(
        Subnet, on_delete=models.CASCADE, related_name="load_balancers"
    )
    servers = models.ManyToManyField(Server, related_name="load_balancers", blank=True)
    environment = models.ForeignKey(
        Environment, on_delete=models.CASCADE, related_name="load_balancers"
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class SecurityGroup(models.Model):
    """Firewall rules/security groups"""

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    network = models.ForeignKey(
        Network, on_delete=models.CASCADE, related_name="security_groups"
    )
    servers = models.ManyToManyField(Server, related_name="security_groups", blank=True)

    def __str__(self):
        return self.name


class SecurityRule(models.Model):
    """Individual firewall rules"""

    PROTOCOLS = [
        ("tcp", "TCP"),
        ("udp", "UDP"),
        ("icmp", "ICMP"),
    ]

    DIRECTIONS = [
        ("inbound", "Inbound"),
        ("outbound", "Outbound"),
    ]

    security_group = models.ForeignKey(
        SecurityGroup, on_delete=models.CASCADE, related_name="rules"
    )
    direction = models.CharField(max_length=10, choices=DIRECTIONS)
    protocol = models.CharField(max_length=10, choices=PROTOCOLS)
    port_range = models.CharField(max_length=20)  # e.g., "80", "443", "1024-65535"
    source_cidr = models.CharField(max_length=50)
    description = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"{self.security_group.name} - {self.direction} {self.protocol}/{self.port_range}"


class MonitoringAlert(models.Model):
    """Monitoring alerts for servers"""

    SEVERITY_LEVELS = [
        ("info", "Info"),
        ("warning", "Warning"),
        ("critical", "Critical"),
    ]

    server = models.ForeignKey(Server, on_delete=models.CASCADE, related_name="alerts")
    severity = models.CharField(max_length=10, choices=SEVERITY_LEVELS)
    message = models.TextField()
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.server.hostname} - {self.severity}: {self.message[:50]}"
