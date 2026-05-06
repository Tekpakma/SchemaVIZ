from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase


class SchemaVizMigrationResetCommandTests(TestCase):
    def test_diagnostic_mode_reports_current_schema(self):
        output = StringIO()

        call_command("schema_viz_migration_reset", stdout=output)

        rendered = output.getvalue()
        self.assertIn("Database: default", rendered)
        self.assertIn("Applied django_schema_viz migrations:", rendered)
        self.assertIn("Current django_schema_viz content types:", rendered)
        self.assertIn("Current model table state:", rendered)
        self.assertIn("django_schema_viz.SchemaVizUserPreference: ok", rendered)

    def test_destructive_options_require_explicit_confirmation(self):
        with self.assertRaisesMessage(
            CommandError,
            "Refusing destructive migration-reset cleanup",
        ):
            call_command(
                "schema_viz_migration_reset",
                "--drop-app-tables",
                stdout=StringIO(),
            )

    def test_fresh_reset_requires_explicit_confirmation(self):
        with self.assertRaisesMessage(
            CommandError,
            "Refusing destructive migration-reset cleanup",
        ):
            call_command(
                "schema_viz_migration_reset",
                "--fresh-reset",
                stdout=StringIO(),
            )

    def test_migrate_requires_clearing_migration_records(self):
        with self.assertRaisesMessage(CommandError, "--migrate requires"):
            call_command(
                "schema_viz_migration_reset",
                "--migrate",
                "--confirm-drop-data",
                stdout=StringIO(),
            )

    def test_remove_stale_content_types_requires_confirmation(self):
        with self.assertRaisesMessage(
            CommandError,
            "Refusing stale content type cleanup",
        ):
            call_command(
                "schema_viz_migration_reset",
                "--remove-stale-content-types",
                stdout=StringIO(),
            )

    def test_remove_stale_content_types_with_destructive_reset_requires_migrate(self):
        with self.assertRaisesMessage(
            CommandError,
            "--remove-stale-content-types with destructive cleanup requires --migrate",
        ):
            call_command(
                "schema_viz_migration_reset",
                "--drop-app-tables",
                "--remove-stale-content-types",
                "--confirm-drop-data",
                "--confirm-content-type-change",
                stdout=StringIO(),
            )

    def test_prune_stale_records_requires_explicit_confirmation(self):
        with self.assertRaisesMessage(
            CommandError,
            "Refusing to prune stale migration records",
        ):
            call_command(
                "schema_viz_migration_reset",
                "--prune-stale-migration-records",
                stdout=StringIO(),
            )

    def test_prune_stale_records_cannot_combine_with_destructive_reset(self):
        with self.assertRaisesMessage(
            CommandError,
            "cannot be combined",
        ):
            call_command(
                "schema_viz_migration_reset",
                "--prune-stale-migration-records",
                "--drop-app-tables",
                "--confirm-migration-record-change",
                "--confirm-drop-data",
                stdout=StringIO(),
            )
