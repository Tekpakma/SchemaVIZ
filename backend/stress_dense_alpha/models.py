from django.db import models

from stress_core.models import DenseTargetRelationMixin


class AlphaHub(DenseTargetRelationMixin):
    dataset_label = models.SlugField(db_index=True)
    name = models.CharField(max_length=140)
    anchor = models.ForeignKey(
        "stress_core.StressAnchor",
        on_delete=models.CASCADE,
        related_name="alpha_hubs",
    )
    status = models.CharField(max_length=30, default="ready")
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["dataset_label", "name"]

    def __str__(self):
        return self.name
