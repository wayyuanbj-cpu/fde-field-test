import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fde_network.db import connect, initialize
from fde_network.import_talents import ValidationError, import_records, validate_record
from backend.tests.test_network_db import PROFILE_PAYLOAD


class NetworkImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.conn = connect(self.temp.name)
        self.now = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
        initialize(self.conn, self.now)

    def tearDown(self):
        self.conn.close()
        self.temp.close()

    def test_import_rejects_unapproved_private_and_unknown_data(self):
        with self.assertRaises(ValidationError):
            validate_record({**PROFILE_PAYLOAD, "public_authorized": False})
        for key in ("phone", "email", "id_number", "client_raw_name", "contract_body", "unredacted_url"):
            with self.subTest(key=key):
                with self.assertRaises(ValidationError):
                    validate_record({**PROFILE_PAYLOAD, key: "private"})

    def test_import_is_idempotent_by_slug_and_stays_unpublished_by_default(self):
        first = import_records(self.conn, [PROFILE_PAYLOAD], "owner:1", self.now)
        second = import_records(self.conn, [PROFILE_PAYLOAD], "owner:1", self.now)
        self.assertEqual(first, {"created": 1, "updated": 0})
        self.assertEqual(second, {"created": 0, "updated": 1})
        row = self.conn.execute("SELECT * FROM talent_profiles").fetchone()
        self.assertIsNone(row["published_at"])
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM talent_profiles").fetchone()[0],
            1,
        )

    def test_publish_is_explicit_and_import_is_atomic(self):
        imported = import_records(
            self.conn,
            [PROFILE_PAYLOAD],
            "owner:1",
            self.now,
            publish=True,
        )
        self.assertEqual(imported, {"created": 1, "updated": 0})
        self.assertIsNotNone(
            self.conn.execute("SELECT published_at FROM talent_profiles").fetchone()[0]
        )
        invalid = {**PROFILE_PAYLOAD, "slug": "second", "public_authorized": False}
        with self.assertRaises(ValidationError):
            import_records(self.conn, [{**PROFILE_PAYLOAD, "slug": "first"}, invalid], "owner:1", self.now)
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM talent_profiles").fetchone()[0],
            1,
        )

    def test_example_file_is_fictional_and_schema_declares_no_private_contact_fields(self):
        root = Path(__file__).resolve().parents[2]
        records = json.loads((root / "data/first-batch-talents.example.json").read_text())
        schema = json.loads((root / "data/first-batch-talents.schema.json").read_text())
        self.assertTrue(records[0]["display_name"].startswith("示例"))
        properties = schema["items"]["properties"]
        self.assertEqual(records[0]["certification_status"], "not_certified")
        self.assertEqual(records[0]["delivery_status"], "unverified")
        self.assertIn("certification_status", schema["items"]["required"])
        self.assertIn("delivery_status", schema["items"]["required"])
        for key in ("phone", "mobile", "email", "wechat", "id_number"):
            self.assertNotIn(key, properties)


if __name__ == "__main__":
    unittest.main()
