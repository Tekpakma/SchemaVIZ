from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("django_schema_viz", "0003_group_template"),
    ]

    operations = [
        migrations.DeleteModel(
            name="EnvironmentSyncRun",
        ),
    ]
