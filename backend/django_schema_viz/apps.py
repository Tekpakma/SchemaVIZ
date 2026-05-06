from django.apps import AppConfig


class DjangoSchemaVizConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "django_schema_viz"
    verbose_name = "Django Schema Viz"

    def ready(self):
        from django_schema_viz import checks  # noqa: F401

        # QLab currently defines its post_migrate receiver in qlab.signals but
        # does not import that module from QLabConfig.ready(). Importing it
        # here keeps QLab external while still registering the receiver.
        try:
            import qlab.signals  # noqa: F401
        except ImportError:
            pass
