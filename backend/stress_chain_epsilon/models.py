from django.conf import settings
from django.db import models


class EpsilonWorkspace(models.Model):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=140)
    root_delta_node = models.ForeignKey(
        "stress_chain_delta.DeltaNode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="epsilon_workspaces",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="schema_stress_epsilon_workspaces",
    )
    primary_target = models.ForeignKey(
        "stress_core.StressTarget05",
        on_delete=models.PROTECT,
        related_name="epsilon_workspaces",
    )

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name


class EpsilonCard(models.Model):
    dataset_label = models.SlugField(db_index=True)
    title = models.CharField(max_length=160)
    workspace = models.ForeignKey(
        EpsilonWorkspace,
        on_delete=models.CASCADE,
        related_name="cards",
    )
    primary_target = models.ForeignKey(
        "stress_core.StressTarget06",
        on_delete=models.PROTECT,
        related_name="epsilon_primary_cards",
    )
    secondary_target = models.ForeignKey(
        "stress_core.StressTarget07",
        on_delete=models.PROTECT,
        related_name="epsilon_secondary_cards",
    )
    related_cards = models.ManyToManyField(
        "self",
        blank=True,
        symmetrical=False,
        related_name="referenced_by_cards",
    )

    class Meta:
        ordering = ["dataset_label", "title"]

    def __str__(self):
        return self.title


class EpsilonComment(models.Model):
    dataset_label = models.SlugField(db_index=True)
    card = models.ForeignKey(
        EpsilonCard,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="schema_stress_epsilon_comments",
    )
    body = models.TextField()
    mentioned_targets = models.ManyToManyField(
        "stress_core.StressTarget08",
        blank=True,
        related_name="epsilon_comments",
    )

    class Meta:
        ordering = ["dataset_label", "id"]

    def __str__(self):
        return f"{self.card}: {self.body[:32]}"
