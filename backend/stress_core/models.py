from django.db import models


class StressAnchor(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=120)
    external_key = models.CharField(max_length=80, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name


class StressTargetBase(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=80, db_index=True)
    ordinal = models.PositiveIntegerField(default=0)
    anchor = models.ForeignKey(
        StressAnchor,
        on_delete=models.CASCADE,
        related_name="%(class)s_items",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        abstract = True
        ordering = ["dataset_label", "ordinal", "name"]

    def __str__(self):
        return self.name


class StressTarget01(StressTargetBase):
    pass


class StressTarget02(StressTargetBase):
    pass


class StressTarget03(StressTargetBase):
    pass


class StressTarget04(StressTargetBase):
    pass


class StressTarget05(StressTargetBase):
    pass


class StressTarget06(StressTargetBase):
    pass


class StressTarget07(StressTargetBase):
    pass


class StressTarget08(StressTargetBase):
    pass


class StressTarget09(StressTargetBase):
    pass


class StressTarget10(StressTargetBase):
    pass


class StressTarget11(StressTargetBase):
    pass


class StressTarget12(StressTargetBase):
    pass


class StressTarget13(StressTargetBase):
    pass


class StressTarget14(StressTargetBase):
    pass


class StressTarget15(StressTargetBase):
    pass


class StressTarget16(StressTargetBase):
    pass


class StressTarget17(StressTargetBase):
    pass


class StressTarget18(StressTargetBase):
    pass


class StressTarget19(StressTargetBase):
    pass


class StressTarget20(StressTargetBase):
    pass


class StressTarget21(StressTargetBase):
    pass


class StressTarget22(StressTargetBase):
    pass


class StressTarget23(StressTargetBase):
    pass


class StressTarget24(StressTargetBase):
    pass


class StressTarget25(StressTargetBase):
    pass


class StressTarget26(StressTargetBase):
    pass


class StressTarget27(StressTargetBase):
    pass


class StressTarget28(StressTargetBase):
    pass


class StressTarget29(StressTargetBase):
    pass


class StressTarget30(StressTargetBase):
    pass


class StressTarget31(StressTargetBase):
    pass


class StressTarget32(StressTargetBase):
    pass


class StressTarget33(StressTargetBase):
    pass


class StressTarget34(StressTargetBase):
    pass


class StressTarget35(StressTargetBase):
    pass


class StressTarget36(StressTargetBase):
    pass


class DenseTargetRelationMixin(models.Model):
    secondary_anchor = models.ForeignKey(
        "stress_core.StressAnchor",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_secondary_items",
    )
    target_01 = models.ForeignKey(
        "stress_core.StressTarget01",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_01",
    )
    target_02 = models.ForeignKey(
        "stress_core.StressTarget02",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_02",
    )
    target_03 = models.ForeignKey(
        "stress_core.StressTarget03",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_03",
    )
    target_04 = models.ForeignKey(
        "stress_core.StressTarget04",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_04",
    )
    target_05 = models.ForeignKey(
        "stress_core.StressTarget05",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_05",
    )
    target_06 = models.ForeignKey(
        "stress_core.StressTarget06",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_06",
    )
    target_07 = models.ForeignKey(
        "stress_core.StressTarget07",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_07",
    )
    target_08 = models.ForeignKey(
        "stress_core.StressTarget08",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_08",
    )
    target_09 = models.ForeignKey(
        "stress_core.StressTarget09",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_09",
    )
    target_10 = models.ForeignKey(
        "stress_core.StressTarget10",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_10",
    )
    target_11 = models.ForeignKey(
        "stress_core.StressTarget11",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_11",
    )
    target_12 = models.ForeignKey(
        "stress_core.StressTarget12",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_12",
    )
    target_13 = models.ForeignKey(
        "stress_core.StressTarget13",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_13",
    )
    target_14 = models.ForeignKey(
        "stress_core.StressTarget14",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_14",
    )
    target_15 = models.ForeignKey(
        "stress_core.StressTarget15",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_15",
    )
    target_16 = models.ForeignKey(
        "stress_core.StressTarget16",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_16",
    )
    target_17 = models.ForeignKey(
        "stress_core.StressTarget17",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_17",
    )
    target_18 = models.ForeignKey(
        "stress_core.StressTarget18",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_18",
    )
    target_19 = models.ForeignKey(
        "stress_core.StressTarget19",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_19",
    )
    target_20 = models.ForeignKey(
        "stress_core.StressTarget20",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_20",
    )
    target_21 = models.ForeignKey(
        "stress_core.StressTarget21",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_21",
    )
    target_22 = models.ForeignKey(
        "stress_core.StressTarget22",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_22",
    )
    target_23 = models.ForeignKey(
        "stress_core.StressTarget23",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_23",
    )
    target_24 = models.ForeignKey(
        "stress_core.StressTarget24",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_24",
    )
    target_25 = models.ForeignKey(
        "stress_core.StressTarget25",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_25",
    )
    target_26 = models.ForeignKey(
        "stress_core.StressTarget26",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_26",
    )
    target_27 = models.ForeignKey(
        "stress_core.StressTarget27",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_27",
    )
    target_28 = models.ForeignKey(
        "stress_core.StressTarget28",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_28",
    )
    target_29 = models.ForeignKey(
        "stress_core.StressTarget29",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_29",
    )
    target_30 = models.ForeignKey(
        "stress_core.StressTarget30",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_target_30",
    )
    target_set_31 = models.ManyToManyField(
        "stress_core.StressTarget31",
        blank=True,
        related_name="%(app_label)s_%(class)s_target_set_31",
    )
    target_set_32 = models.ManyToManyField(
        "stress_core.StressTarget32",
        blank=True,
        related_name="%(app_label)s_%(class)s_target_set_32",
    )
    target_set_33 = models.ManyToManyField(
        "stress_core.StressTarget33",
        blank=True,
        related_name="%(app_label)s_%(class)s_target_set_33",
    )
    target_set_34 = models.ManyToManyField(
        "stress_core.StressTarget34",
        blank=True,
        related_name="%(app_label)s_%(class)s_target_set_34",
    )
    target_set_35 = models.ManyToManyField(
        "stress_core.StressTarget35",
        blank=True,
        related_name="%(app_label)s_%(class)s_target_set_35",
    )
    target_set_36 = models.ManyToManyField(
        "stress_core.StressTarget36",
        blank=True,
        related_name="%(app_label)s_%(class)s_target_set_36",
    )

    class Meta:
        abstract = True
