from django.db import models


class DeltaNode(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=140)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    core_target = models.ForeignKey(
        "stress_core.StressTarget01",
        on_delete=models.PROTECT,
        related_name="delta_nodes",
    )
    alternate_target = models.ForeignKey(
        "stress_core.StressTarget02",
        on_delete=models.PROTECT,
        related_name="delta_alternate_nodes",
    )

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name


class DeltaLink(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=140)
    source = models.ForeignKey(
        DeltaNode,
        on_delete=models.CASCADE,
        related_name="outgoing_links",
    )
    target = models.ForeignKey(
        DeltaNode,
        on_delete=models.CASCADE,
        related_name="incoming_links",
    )
    alpha_hub = models.ForeignKey(
        "stress_dense_alpha.AlphaHub",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    tags = models.ManyToManyField(
        "stress_core.StressTarget03",
        blank=True,
        related_name="delta_links",
    )

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name


class DeltaBundle(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=140)
    preferred_link = models.OneToOneField(
        DeltaLink,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="preferred_for_bundle",
    )
    nodes = models.ManyToManyField(DeltaNode, blank=True, related_name="bundles")
    links = models.ManyToManyField(DeltaLink, blank=True, related_name="bundles")
    owner_target = models.ForeignKey(
        "stress_core.StressTarget04",
        on_delete=models.PROTECT,
        related_name="delta_bundles",
    )

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name
