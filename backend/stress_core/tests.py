from io import StringIO

from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from qlab.models import ModelRegistry

STRESS_APP_LABELS = (
    "stress_core",
    "stress_dense_alpha",
    "stress_dense_beta",
    "stress_dense_gamma",
    "stress_chain_delta",
    "stress_chain_epsilon",
    "stress_chain_zeta",
)


class SchemaStressAppShapeTests(TestCase):
    def test_stress_apps_are_installed_and_qlab_allowed(self):
        installed = set(settings.INSTALLED_APPS)
        allowed = set(settings.QLAB_SETTINGS["ALLOWED_APPS"])

        for app_label in STRESS_APP_LABELS:
            self.assertIn(app_label, installed)
            self.assertIn(app_label, allowed)

    def test_dense_hubs_have_at_least_thirty_direct_relations(self):
        dense_models = (
            apps.get_model("stress_dense_alpha", "AlphaHub"),
            apps.get_model("stress_dense_beta", "BetaHub"),
            apps.get_model("stress_dense_gamma", "GammaHub"),
        )

        for model in dense_models:
            relation_fields = [
                field
                for field in model._meta.get_fields()
                if field.is_relation and not field.auto_created
            ]
            self.assertGreaterEqual(
                len(relation_fields),
                30,
                f"{model._meta.label} should keep enough relations for UI stress tests.",
            )


class GenerateSchemaStressDataCommandTests(TestCase):
    def run_generate(self, **overrides):
        options = {
            "label": "stress-test",
            "anchors": 1,
            "records_per_target": 1,
            "hubs_per_dense_app": 1,
            "seed": 123,
        }
        options.update(overrides)
        call_command("generate_schema_stress_data", stdout=StringIO(), **options)

    def test_generate_schema_stress_data_creates_records_across_apps(self):
        self.run_generate()

        self.assertEqual(
            apps.get_model("stress_core", "StressAnchor").objects.filter(
                dataset_label="stress-test"
            ).count(),
            1,
        )
        self.assertEqual(
            apps.get_model("stress_core", "StressTarget36").objects.filter(
                dataset_label="stress-test"
            ).count(),
            1,
        )
        self.assertEqual(
            apps.get_model("stress_dense_alpha", "AlphaHub").objects.filter(
                dataset_label="stress-test"
            ).count(),
            1,
        )
        self.assertEqual(
            apps.get_model("stress_dense_beta", "BetaHub").objects.filter(
                dataset_label="stress-test"
            ).count(),
            1,
        )
        self.assertEqual(
            apps.get_model("stress_dense_gamma", "GammaHub").objects.filter(
                dataset_label="stress-test"
            ).count(),
            1,
        )
        self.assertGreater(
            apps.get_model("stress_chain_zeta", "ZetaCheckpoint").objects.filter(
                dataset_label="stress-test"
            ).count(),
            0,
        )
        self.assertEqual(
            ModelRegistry.objects.get(model_label="stress_dense_alpha_AlphaHub").status,
            "enabled",
        )

    def test_generate_schema_stress_data_requires_replace_for_existing_label(self):
        self.run_generate()

        with self.assertRaises(CommandError):
            self.run_generate()

    def test_generate_schema_stress_data_replace_rebuilds_existing_label(self):
        self.run_generate(anchors=1)
        self.run_generate(replace=True, anchors=2)

        self.assertEqual(
            apps.get_model("stress_core", "StressAnchor").objects.filter(
                dataset_label="stress-test"
            ).count(),
            2,
        )
