import json
import tempfile
import unittest
from datetime import datetime, timezone

from fde_network.db import connect, initialize, public_config, set_feature_flag


class NetworkDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.now = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.temp.close()

    def test_initialize_creates_versioned_business_schema(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        names = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        self.assertTrue(
            {
                "schema_migrations",
                "feature_flags",
                "talent_profiles",
                "talent_tags",
                "audit_events",
            }.issubset(names)
        )
        self.assertNotIn("events", names)
        self.assertEqual(
            public_config(conn),
            {"network_enabled": False, "talent_directory_enabled": False},
        )
        self.assertEqual(
            conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0],
            1,
        )
        conn.close()

    def test_feature_flag_change_is_audited_and_unknown_keys_are_rejected(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        changed = set_feature_flag(
            conn,
            "network_enabled",
            True,
            actor="owner:1",
            now=self.now,
        )
        self.assertTrue(changed["enabled"])
        row = conn.execute(
            "SELECT action, actor, object_type, object_id, before_json, after_json FROM audit_events"
        ).fetchone()
        self.assertEqual(
            tuple(row)[:4],
            ("feature_flag.update", "owner:1", "feature_flag", "network_enabled"),
        )
        self.assertEqual(json.loads(row["before_json"]), {"enabled": False})
        self.assertEqual(json.loads(row["after_json"]), {"enabled": True})
        with self.assertRaises(ValueError):
            set_feature_flag(conn, "unknown", True, "owner:1", self.now)
        with self.assertRaises(Exception):
            conn.execute("UPDATE audit_events SET action='changed'")
        conn.close()


if __name__ == "__main__":
    unittest.main()
