from django.db import models


class ZetaScenario(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=140)
    anchor = models.ForeignKey(
        "stress_core.StressAnchor",
        on_delete=models.CASCADE,
        related_name="zeta_scenarios",
    )
    alpha_hub = models.ForeignKey(
        "stress_dense_alpha.AlphaHub",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    beta_hub = models.ForeignKey(
        "stress_dense_beta.BetaHub",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zeta_scenarios",
    )
    gamma_hub = models.ForeignKey(
        "stress_dense_gamma.GammaHub",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zeta_scenarios",
    )

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name


class ZetaStep(models.Model):
    dataset_label = models.SlugField(db_index=True)
    scenario = models.ForeignKey(
        ZetaScenario,
        on_delete=models.CASCADE,
        related_name="steps",
    )
    name = models.CharField(max_length=140)
    previous_step = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="next_steps",
    )
    fanout_targets = models.ManyToManyField(
        "stress_core.StressTarget09",
        blank=True,
        related_name="zeta_steps",
    )
    gateway_target = models.ForeignKey(
        "stress_core.StressTarget10",
        on_delete=models.PROTECT,
        related_name="zeta_gateway_steps",
    )

    class Meta:
        ordering = ["dataset_label", "scenario", "id"]

    def __str__(self):
        return self.name


class ZetaCheckpoint(models.Model):
    dataset_label = models.SlugField(db_index=True)
    step = models.OneToOneField(
        ZetaStep,
        on_delete=models.CASCADE,
        related_name="checkpoint",
    )
    delta_bundle = models.ForeignKey(
        "stress_chain_delta.DeltaBundle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zeta_checkpoints",
    )
    depends_on = models.ManyToManyField(
        ZetaStep,
        blank=True,
        related_name="dependent_checkpoints",
    )
    review_target = models.ForeignKey(
        "stress_core.StressTarget11",
        on_delete=models.PROTECT,
        related_name="zeta_checkpoints",
    )

    class Meta:
        ordering = ["dataset_label", "step"]

    def __str__(self):
        return f"Checkpoint for {self.step}"
