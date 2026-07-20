import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone

from fde_commercial import db as commercial_db
from fde_commercial.db import (
    append_audit,
    connect,
    enqueue_outbox,
    get_product_by_code,
    initialize,
)


class CommercialDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.now = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.temp.close()

    def test_initialize_creates_isolated_versioned_commercial_schema(self):
        conn = connect(self.temp.name)
        self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        self.assertEqual(conn.execute("PRAGMA journal_mode").fetchone()[0], "wal")
        self.assertEqual(conn.execute("PRAGMA busy_timeout").fetchone()[0], 10000)
        initialize(conn, self.now)
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        self.assertTrue(
            {
                "schema_migrations",
                "commercial_products",
                "commercial_offers",
                "training_applications",
                "commercial_opportunities",
                "training_cohorts",
                "training_enrollments",
                "commercial_audit_events",
                "commercial_outbox",
            }.issubset(tables)
        )
        self.assertNotIn("events", tables)
        self.assertNotIn("talent_profiles", tables)
        self.assertEqual(
            2,
            conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0],
        )
        application_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(training_applications)")
        }
        self.assertIn("status_reason", application_columns)
        conn.close()

    def test_initialize_seeds_small_class_product_and_open_offer(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        product = get_product_by_code(conn, "FDE-TRAINING-SMALL-CLASS")
        self.assertEqual(product["name"], "OneX FDE 小班实战培训")
        self.assertEqual(product["type"], "training")
        self.assertEqual(product["capacity_per_cohort"], 10)
        self.assertEqual(product["application_mode"], "review_required")
        offer = conn.execute("SELECT * FROM commercial_offers").fetchone()
        self.assertEqual(offer["status"], "open")
        self.assertIsNone(offer["starts_at"])
        self.assertIsNone(offer["ends_at"])
        conn.close()

    def test_initialize_upgrades_existing_version_one_database(self):
        conn = connect(self.temp.name)
        with conn:
            conn.execute(commercial_db._SCHEMA_MIGRATIONS_SQL)
            for statement in commercial_db._MIGRATION_1_STATEMENTS:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)",
                ("2026-07-19T00:00:00Z",),
            )

        initialize(conn, self.now)

        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(training_applications)")
        }
        self.assertIn("status_reason", columns)
        self.assertEqual(
            [1, 2],
            [
                row[0]
                for row in conn.execute(
                    "SELECT version FROM schema_migrations ORDER BY version"
                )
            ],
        )
        conn.close()

    def test_reinitialize_preserves_operator_edits_to_seed_rows(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        with conn:
            conn.execute(
                "UPDATE commercial_products SET name = ? WHERE code = ?",
                ("运营调整后的课程名称", "FDE-TRAINING-SMALL-CLASS"),
            )
            conn.execute(
                "UPDATE commercial_offers SET status = 'paused' WHERE code = ?",
                ("fde-small-class-open-application",),
            )

        initialize(conn, self.now)

        product = get_product_by_code(conn, "FDE-TRAINING-SMALL-CLASS")
        offer = conn.execute(
            "SELECT * FROM commercial_offers WHERE code = ?",
            ("fde-small-class-open-application",),
        ).fetchone()
        self.assertEqual(product["name"], "运营调整后的课程名称")
        self.assertEqual(offer["status"], "paused")
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM commercial_products").fetchone()[0],
            1,
        )
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM commercial_offers").fetchone()[0],
            1,
        )
        conn.close()

    def test_audit_and_outbox_are_append_only(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        audit_id = append_audit(
            conn,
            actor="system",
            action="product.seed",
            object_type="commercial_product",
            object_id="FDE-TRAINING-SMALL-CLASS",
            before=None,
            after={"status": "active"},
            now=self.now,
        )
        outbox_id = enqueue_outbox(
            conn,
            topic="commercial.product.synced",
            object_type="commercial_product",
            object_id="FDE-TRAINING-SMALL-CLASS",
            payload={"code": "FDE-TRAINING-SMALL-CLASS"},
            now=self.now,
        )
        self.assertGreater(audit_id, 0)
        self.assertGreater(outbox_id, 0)
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("UPDATE commercial_audit_events SET action='changed'")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("DELETE FROM commercial_audit_events")
        conn.close()

    def test_audit_and_outbox_reject_secret_bearing_keys(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        forbidden_keys = (
            "password",
            "access_token",
            "csrf_value",
            "raw_ip",
            "full_user_agent",
            "id_number",
            "exam_answer",
        )
        for key in forbidden_keys:
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    append_audit(
                        conn,
                        actor="system",
                        action="unsafe",
                        object_type="test",
                        object_id="1",
                        before=None,
                        after={key: "secret"},
                        now=self.now,
                    )
        with self.assertRaises(ValueError):
            enqueue_outbox(
                conn,
                topic="unsafe",
                object_type="test",
                object_id="1",
                payload={"nested": [{"refresh_token": "secret"}]},
                now=self.now,
            )
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM commercial_audit_events").fetchone()[0],
            0,
        )
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM commercial_outbox").fetchone()[0],
            0,
        )
        conn.close()


if __name__ == "__main__":
    unittest.main()
