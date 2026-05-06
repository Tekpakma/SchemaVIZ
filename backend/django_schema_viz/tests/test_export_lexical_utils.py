from django.test import SimpleTestCase

from django_schema_viz.export._lexical_utils import (
    resolve_known_placeholders,
    resolve_placeholder_value,
)


class ExportLexicalUtilsTests(SimpleTestCase):
    def test_resolve_placeholder_value_formats_iso_dates(self):
        value = resolve_placeholder_value(
            "created_at",
            {"_record_fields": {"created_at": "2026-04-28T19:29:49Z"}},
        )

        self.assertNotEqual(value, "2026-04-28T19:29:49Z")
        self.assertIn("2026", value)

    def test_resolve_known_placeholders_formats_iso_dates(self):
        value = resolve_known_placeholders(
            "Created {{ created_at }}",
            {"_record_fields": {"created_at": "2026-04-28"}},
        )

        self.assertNotIn("2026-04-28", value)
        self.assertIn("2026", value)
