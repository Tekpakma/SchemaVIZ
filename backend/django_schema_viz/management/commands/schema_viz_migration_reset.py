from __future__ import annotations

from dataclasses import dataclass

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.core.management import BaseCommand, CommandError, call_command
from django.db import connections, transaction
from django.db.migrations.recorder import MigrationRecorder


APP_LABEL = "django_schema_viz"
CURRENT_MIGRATION_NAMES = {"0001_initial"}


@dataclass(frozen=True)
class ModelTableState:
    model_label: str
    table_name: str
    exists: bool
    missing_columns: tuple[str, ...]


def get_schema_viz_models():
    app_config = apps.get_app_config(APP_LABEL)
    return [
        model
        for model in app_config.get_models(include_auto_created=False)
        if model._meta.managed and not model._meta.proxy
    ]


def get_expected_columns(model) -> set[str]:
    columns: set[str] = set()
    for field in model._meta.local_fields:
        if field.column:
            columns.add(field.column)
    return columns


def inspect_model_tables(connection) -> list[ModelTableState]:
    existing_tables = set(connection.introspection.table_names())
    states: list[ModelTableState] = []

    with connection.cursor() as cursor:
        for model in get_schema_viz_models():
            table_name = model._meta.db_table
            exists = table_name in existing_tables
            missing_columns: tuple[str, ...] = ()

            if exists:
                table_description = connection.introspection.get_table_description(
                    cursor,
                    table_name,
                )
                existing_columns = {column.name for column in table_description}
                missing_columns = tuple(
                    sorted(get_expected_columns(model) - existing_columns)
                )

            states.append(
                ModelTableState(
                    model_label=model._meta.label,
                    table_name=table_name,
                    exists=exists,
                    missing_columns=missing_columns,
                )
            )

    return states


def get_applied_migration_names(connection) -> list[str]:
    recorder = MigrationRecorder(connection)
    if not recorder.has_table():
        return []

    return list(
        recorder.migration_qs.filter(app=APP_LABEL)
        .order_by("name")
        .values_list("name", flat=True)
    )


def get_app_content_type_models(database: str) -> list[str]:
    if not apps.is_installed("django.contrib.contenttypes"):
        return []

    return list(
        ContentType.objects.db_manager(database)
        .filter(app_label=APP_LABEL)
        .order_by("model")
        .values_list("model", flat=True)
    )


def clear_migration_records(connection) -> int:
    recorder = MigrationRecorder(connection)
    if not recorder.has_table():
        return 0

    deleted_count, _deleted_by_model = recorder.migration_qs.filter(app=APP_LABEL).delete()
    return deleted_count


def prune_stale_migration_records(connection) -> int:
    recorder = MigrationRecorder(connection)
    if not recorder.has_table():
        return 0

    deleted_count, _deleted_by_model = (
        recorder.migration_qs.filter(app=APP_LABEL)
        .exclude(name__in=CURRENT_MIGRATION_NAMES)
        .delete()
    )
    return deleted_count


def quote_table_name(connection, table_name: str) -> str:
    return connection.ops.quote_name(table_name)


def drop_app_tables(connection, states: list[ModelTableState]) -> list[str]:
    existing_tables = [state.table_name for state in states if state.exists]
    if not existing_tables:
        return []

    dropped_tables: list[str] = []
    drop_suffix = " CASCADE" if connection.vendor == "postgresql" else ""
    connection.disable_constraint_checking()
    try:
        with connection.cursor() as cursor:
            for table_name in reversed(existing_tables):
                cursor.execute(
                    f"DROP TABLE IF EXISTS {quote_table_name(connection, table_name)}{drop_suffix}"
                )
                dropped_tables.append(table_name)
    finally:
        connection.enable_constraint_checking()

    return dropped_tables


class Command(BaseCommand):
    help = (
        "Diagnose or prepare the django_schema_viz one-migration reset for a "
        "fresh v0.5 install path."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--database",
            default="default",
            help="Database alias to inspect or mutate.",
        )
        parser.add_argument(
            "--drop-app-tables",
            action="store_true",
            help=(
                "Drop all current django_schema_viz app tables. This destroys "
                "SchemaViz drawings, templates, tour progress, and related data."
            ),
        )
        parser.add_argument(
            "--fresh-reset",
            action="store_true",
            help=(
                "One-command disposable reset: drop django_schema_viz tables, "
                "clear its migration records, apply the current one-file "
                "migration, and remove stale content types. Requires "
                "--confirm-drop-data."
            ),
        )
        parser.add_argument(
            "--clear-migration-records",
            action="store_true",
            help="Delete django_schema_viz rows from django_migrations.",
        )
        parser.add_argument(
            "--prune-stale-migration-records",
            action="store_true",
            help=(
                "Delete historical django_schema_viz migration rows that are no "
                "longer present after the one-file reset. This keeps 0001_initial."
            ),
        )
        parser.add_argument(
            "--migrate",
            action="store_true",
            help="Run 'migrate django_schema_viz' after destructive cleanup.",
        )
        parser.add_argument(
            "--remove-stale-content-types",
            action="store_true",
            help=(
                "Run Django's remove_stale_contenttypes after cleanup. This "
                "removes only content types that no longer map to installed "
                "models."
            ),
        )
        parser.add_argument(
            "--confirm-drop-data",
            action="store_true",
            help="Required with destructive options to acknowledge data loss.",
        )
        parser.add_argument(
            "--confirm-migration-record-change",
            action="store_true",
            help="Required with --prune-stale-migration-records.",
        )
        parser.add_argument(
            "--confirm-content-type-change",
            action="store_true",
            help="Required with --remove-stale-content-types.",
        )

    def handle(self, *args, **options):
        database = options["database"]
        connection = connections[database]
        states = inspect_model_tables(connection)
        applied_migrations = get_applied_migration_names(connection)
        content_type_models = get_app_content_type_models(database)

        self.write_report(database, states, applied_migrations, content_type_models)

        fresh_reset = options["fresh_reset"]
        drop_tables = options["drop_app_tables"] or fresh_reset
        clear_records = options["clear_migration_records"] or fresh_reset
        prune_records = options["prune_stale_migration_records"]
        run_migrate = options["migrate"] or fresh_reset
        remove_stale_content_types = options["remove_stale_content_types"] or fresh_reset
        destructive_requested = drop_tables or clear_records or run_migrate
        record_prune_requested = prune_records
        content_type_cleanup_requested = remove_stale_content_types

        if (
            not destructive_requested
            and not record_prune_requested
            and not content_type_cleanup_requested
        ):
            return

        if destructive_requested and record_prune_requested:
            raise CommandError(
                "--prune-stale-migration-records cannot be combined with the "
                "destructive fresh-reset options."
            )

        if record_prune_requested:
            self.prune_records(connection, states, options)

        if (
            content_type_cleanup_requested
            and not fresh_reset
            and not options["confirm_content_type_change"]
        ):
            raise CommandError(
                "Refusing stale content type cleanup without "
                "--confirm-content-type-change."
            )

        if content_type_cleanup_requested and destructive_requested and not run_migrate:
            raise CommandError(
                "--remove-stale-content-types with destructive cleanup requires "
                "--migrate so content types are evaluated after the schema is "
                "recreated."
            )

        if not destructive_requested:
            if content_type_cleanup_requested:
                self.remove_stale_content_types(database, options)
            return

        if not options["confirm_drop_data"]:
            raise CommandError(
                "Refusing destructive migration-reset cleanup without "
                "--confirm-drop-data."
            )

        if run_migrate and not clear_records:
            raise CommandError("--migrate requires --clear-migration-records.")

        if clear_records and not drop_tables:
            existing = [state.table_name for state in states if state.exists]
            if existing:
                raise CommandError(
                    "--clear-migration-records without --drop-app-tables would "
                    "make the new initial migration try to recreate existing "
                    "tables. Add --drop-app-tables for a fresh-reset path."
                )

        with transaction.atomic(using=database):
            if drop_tables:
                dropped_tables = drop_app_tables(connection, states)
                for table_name in dropped_tables:
                    self.stdout.write(self.style.WARNING(f"Dropped {table_name}"))

            if clear_records:
                deleted_count = clear_migration_records(connection)
                self.stdout.write(
                    self.style.WARNING(
                        f"Deleted {deleted_count} django_schema_viz migration record(s)."
                    )
                )

        if run_migrate:
            call_command(
                "migrate",
                APP_LABEL,
                database=database,
                verbosity=options.get("verbosity", 1),
                interactive=False,
            )

        if content_type_cleanup_requested:
            self.remove_stale_content_types(database, options)

    def remove_stale_content_types(self, database: str, options) -> None:
        if not apps.is_installed("django.contrib.contenttypes"):
            self.stdout.write("django.contrib.contenttypes is not installed; skipping.")
            return

        call_command(
            "remove_stale_contenttypes",
            database=database,
            interactive=False,
            verbosity=options.get("verbosity", 1),
        )

    def prune_records(self, connection, states: list[ModelTableState], options) -> None:
        if not options["confirm_migration_record_change"]:
            raise CommandError(
                "Refusing to prune stale migration records without "
                "--confirm-migration-record-change."
            )

        missing_tables = [state for state in states if not state.exists]
        missing_columns = [state for state in states if state.missing_columns]
        if missing_tables or missing_columns:
            raise CommandError(
                "Refusing to prune stale migration records while the current "
                "model tables are missing tables or columns. Use the destructive "
                "fresh-reset path for disposable environments, or migrate through "
                "the historical 0.x chain first."
            )

        deleted_count = prune_stale_migration_records(connection)
        self.stdout.write(
            self.style.WARNING(
                f"Deleted {deleted_count} stale django_schema_viz migration record(s)."
            )
        )

    def write_report(
        self,
        database: str,
        states: list[ModelTableState],
        applied_migrations: list[str],
        content_type_models: list[str],
    ) -> None:
        self.stdout.write(f"Database: {database}")
        self.stdout.write(f"Applied {APP_LABEL} migrations:")
        if applied_migrations:
            for migration_name in applied_migrations:
                self.stdout.write(f"  - {migration_name}")
        else:
            self.stdout.write("  - none")

        self.stdout.write("Current django_schema_viz content types:")
        if content_type_models:
            for model_name in content_type_models:
                self.stdout.write(f"  - {model_name}")
        else:
            self.stdout.write("  - none")

        self.stdout.write("Current model table state:")
        for state in states:
            status = "ok" if state.exists and not state.missing_columns else "needs attention"
            if not state.exists:
                self.stdout.write(
                    self.style.ERROR(
                        f"  - {state.model_label}: missing table {state.table_name}"
                    )
                )
                continue

            if state.missing_columns:
                missing = ", ".join(state.missing_columns)
                self.stdout.write(
                    self.style.ERROR(
                        f"  - {state.model_label}: {status}; missing columns: {missing}"
                    )
                )
                continue

            self.stdout.write(f"  - {state.model_label}: {status}")

        missing_tables = [state for state in states if not state.exists]
        missing_columns = [state for state in states if state.missing_columns]
        stale_migrations = [
            migration_name
            for migration_name in applied_migrations
            if migration_name not in CURRENT_MIGRATION_NAMES
        ]
        if stale_migrations:
            stale_list = ", ".join(stale_migrations)
            self.stdout.write(
                self.style.WARNING(
                    "Stale historical migration rows detected: "
                    f"{stale_list}. If all tables are ok, rerun with "
                    "--prune-stale-migration-records "
                    "--confirm-migration-record-change."
                )
            )

        if missing_tables or missing_columns:
            self.stdout.write(
                self.style.WARNING(
                    "SchemaViz tables do not match the current one-file migration. "
                    "For disposable 0.x databases, rerun with "
                    "--fresh-reset --confirm-drop-data."
                )
            )
