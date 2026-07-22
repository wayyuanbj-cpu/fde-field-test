import json
import tempfile
import unittest
from datetime import datetime, timezone

from fde_network.db import connect, initialize, public_config, set_feature_flag
from fde_network.talents import (
    ValidationError,
    get_public_profile,
    list_public_profiles,
    publish_profile,
    save_profile,
)


PROFILE_PAYLOAD = {
    "slug": "manufacturing-kb-fde",
    "display_name": "制造业知识库 FDE",
    "real_name": "虚构姓名",
    "headline": "把复杂现场知识变成可运行的 AI 流程",
    "city": "北京",
    "service_mode": "hybrid",
    "availability": "available",
    "status": "member",
    "certification_status": "not_certified",
    "delivery_status": "unverified",
    "summary": "擅长知识梳理、检索设计与一线试点。",
    "not_fit": "不承接只要求演示、不提供业务人员的项目。",
    "service_package": "两周问题诊断与知识库试点设计。",
    "evidence_summary": "已完成脱敏的现场调研、样例库和验收清单。",
    "tags": ["知识库", "制造业"],
    "public_authorized": True,
    "locale": "zh-CN",
}


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
            3,
        )
        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(talent_profiles)")
        }
        self.assertTrue({"certification_status", "delivery_status"}.issubset(columns))
        conn.close()

    def test_initialize_migrates_v1_statuses_without_certifying_delivery(self):
        conn = connect(self.temp.name)
        conn.executescript(
            """
            CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
            INSERT INTO schema_migrations VALUES (1, '2026-07-20T09:00:00Z');
            CREATE TABLE talent_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, real_name TEXT NOT NULL,
                headline TEXT NOT NULL, city TEXT NOT NULL, service_mode TEXT NOT NULL,
                availability TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL,
                not_fit TEXT NOT NULL, service_package TEXT NOT NULL, evidence_summary TEXT NOT NULL,
                public_authorized INTEGER NOT NULL DEFAULT 0, locale TEXT NOT NULL DEFAULT 'zh-CN',
                published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            """
        )
        base = (
            "name", "private", "headline", "city", "hybrid", "available",
            "summary", "not fit", "package", "evidence", 1, "zh-CN", None,
            "2026-07-20T09:00:00Z", "2026-07-20T09:00:00Z",
        )
        conn.execute(
            """INSERT INTO talent_profiles(
              slug, display_name, real_name, headline, city, service_mode, availability, status,
              summary, not_fit, service_package, evidence_summary, public_authorized, locale,
              published_at, created_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("legacy-certified", base[0], base[1], base[2], base[3], base[4], base[5], "certified", *base[6:]),
        )
        conn.execute(
            """INSERT INTO talent_profiles(
              slug, display_name, real_name, headline, city, service_mode, availability, status,
              summary, not_fit, service_package, evidence_summary, public_authorized, locale,
              published_at, created_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("legacy-delivery", base[0], base[1], base[2], base[3], base[4], base[5], "delivery", *base[6:]),
        )
        conn.execute(
            """INSERT INTO talent_profiles(
              slug, display_name, real_name, headline, city, service_mode, availability, status,
              summary, not_fit, service_package, evidence_summary, public_authorized, locale,
              published_at, created_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("legacy-pending", base[0], base[1], base[2], base[3], base[4], base[5], "cert_pending", *base[6:]),
        )
        conn.commit()

        initialize(conn, self.now)

        certified = conn.execute(
            "SELECT certification_status, delivery_status FROM talent_profiles WHERE slug='legacy-certified'"
        ).fetchone()
        delivery = conn.execute(
            "SELECT certification_status, delivery_status FROM talent_profiles WHERE slug='legacy-delivery'"
        ).fetchone()
        pending = conn.execute(
            "SELECT certification_status, delivery_status FROM talent_profiles WHERE slug='legacy-pending'"
        ).fetchone()
        self.assertEqual(tuple(certified), ("certified", "unverified"))
        self.assertEqual(tuple(delivery), ("not_certified", "verified"))
        self.assertEqual(tuple(pending), ("pending", "unverified"))
        self.assertEqual(
            conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0], 3
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

    def test_initialize_v3_normalizes_inconsistent_v2_presentation_status(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        profile = save_profile(conn, PROFILE_PAYLOAD, "operator:1", self.now)
        with conn:
            conn.execute(
                """UPDATE talent_profiles
                SET status='certified', certification_status='not_certified', delivery_status='verified'
                WHERE id=?""",
                (profile["id"],),
            )
            conn.execute("DELETE FROM schema_migrations WHERE version=3")

        initialize(conn, self.now)

        migrated = conn.execute(
            "SELECT status, certification_status, delivery_status FROM talent_profiles WHERE id=?",
            (profile["id"],),
        ).fetchone()
        self.assertEqual(tuple(migrated), ("delivery", "not_certified", "verified"))
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM schema_migrations WHERE version=3").fetchone()[0],
            1,
        )
        conn.close()

    def test_public_projection_excludes_private_and_unpublished_profiles(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        draft = save_profile(conn, PROFILE_PAYLOAD, "operator:1", self.now)
        self.assertEqual(list_public_profiles(conn, {}), [])
        publish_profile(conn, draft["id"], "operator:1", self.now)
        visible = list_public_profiles(conn, {})
        self.assertEqual(len(visible), 1)
        self.assertNotIn("real_name", visible[0])
        self.assertNotIn("id", visible[0])
        self.assertNotIn("phone", visible[0])
        self.assertEqual(visible[0]["certification_label"], "尚未完成 OneX 认证")
        self.assertNotIn("badge", visible[0])
        self.assertEqual(get_public_profile(conn, draft["slug"]), visible[0])
        conn.close()

    def test_publish_requires_authorization_evidence_and_valid_status(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        for index, change in enumerate(
            (
                {"public_authorized": False},
                {"evidence_summary": ""},
                {"status": "inactive"},
            )
        ):
            payload = {**PROFILE_PAYLOAD, "slug": f"blocked-{index}", **change}
            profile = save_profile(conn, payload, "operator:1", self.now)
            with self.assertRaises(ValidationError):
                publish_profile(conn, profile["id"], "operator:1", self.now)
        conn.close()

    def test_certification_and_delivery_are_independent_public_facts(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        delivery = save_profile(
            conn,
            {
                **PROFILE_PAYLOAD,
                "slug": "delivery-only",
                "status": "delivery",
                "delivery_status": "verified",
            },
            "operator:1",
            self.now,
        )
        certified = save_profile(
            conn,
            {
                **PROFILE_PAYLOAD,
                "slug": "certified-only",
                "status": "certified",
                "certification_status": "certified",
            },
            "operator:1",
            self.now,
        )
        publish_profile(conn, delivery["id"], "operator:1", self.now)
        publish_profile(conn, certified["id"], "operator:1", self.now)

        delivery_public = get_public_profile(conn, "delivery-only")
        certified_public = get_public_profile(conn, "certified-only")
        self.assertEqual(delivery_public["delivery_status"], "verified")
        self.assertEqual(delivery_public["certification_status"], "not_certified")
        self.assertEqual(delivery_public["certification_label"], "尚未完成 OneX 认证")
        self.assertEqual(delivery_public["delivery_label"], "已有经核验交付记录")
        self.assertEqual(certified_public["certification_status"], "certified")
        self.assertEqual(certified_public["delivery_status"], "unverified")
        self.assertEqual(certified_public["certification_label"], "OneX 认证 FDE")
        self.assertEqual(certified_public["delivery_label"], "尚无经核验交付记录")
        published_audit = conn.execute(
            "SELECT after_json FROM audit_events WHERE action='talent_profile.published' AND object_id='certified-only'"
        ).fetchone()
        self.assertEqual(
            json.loads(published_audit["after_json"]),
            {
                "certification_status": "certified",
                "delivery_status": "unverified",
                "published": True,
                "status": "certified",
            },
        )
        for field, value in (
            ("certification_status", "legacy_badge"),
            ("delivery_status", "assumed"),
        ):
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    save_profile(
                        conn,
                        {**PROFILE_PAYLOAD, "slug": f"invalid-{field.replace('_', '-')}", field: value},
                        "operator:1",
                        self.now,
                    )
        index = 0
        for certification in ("not_certified", "pending", "certified"):
            for delivery_state in ("unverified", "verified"):
                expected = (
                    "delivery" if delivery_state == "verified"
                    else "certified" if certification == "certified"
                    else "cert_pending" if certification == "pending"
                    else "member"
                )
                for status in ("member", "cert_pending", "certified", "delivery"):
                    if status == expected:
                        continue
                    with self.subTest(
                        status=status,
                        certification=certification,
                        delivery=delivery_state,
                    ):
                        slug = f"mismatch-{index}"
                        index += 1
                        with self.assertRaises(ValidationError):
                            save_profile(
                                conn,
                                {
                                    **PROFILE_PAYLOAD,
                                    "slug": slug,
                                    "status": status,
                                    "certification_status": certification,
                                    "delivery_status": delivery_state,
                                },
                                "operator:1",
                                self.now,
                            )
                        self.assertIsNone(get_public_profile(conn, slug))
        conn.close()

    def test_status_matrix_accepts_each_consistent_public_combination(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        matrix = (
            ("member", "not_certified", "unverified"),
            ("cert_pending", "pending", "unverified"),
            ("certified", "certified", "unverified"),
            ("delivery", "not_certified", "verified"),
            ("delivery", "pending", "verified"),
            ("delivery", "certified", "verified"),
        )
        for index, (status, certification, delivery) in enumerate(matrix):
            profile = save_profile(
                conn,
                {
                    **PROFILE_PAYLOAD,
                    "slug": f"matrix-{index}",
                    "status": status,
                    "certification_status": certification,
                    "delivery_status": delivery,
                },
                "operator:1",
                self.now,
            )
            publish_profile(conn, profile["id"], "operator:1", self.now)
            public = get_public_profile(conn, profile["slug"])
            self.assertEqual(public["status"], status)
        conn.close()

    def test_filters_are_allowlisted_and_parameterized(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        profile = save_profile(conn, PROFILE_PAYLOAD, "operator:1", self.now)
        publish_profile(conn, profile["id"], "operator:1", self.now)
        result = list_public_profiles(
            conn,
            {
                "status": "member",
                "tag": "知识库",
                "city": "北京",
                "availability": "available",
            },
        )
        self.assertEqual([item["slug"] for item in result], ["manufacturing-kb-fde"])
        with self.assertRaises(ValidationError):
            list_public_profiles(conn, {"sort": "score desc; drop table talent_profiles"})
        conn.close()


if __name__ == "__main__":
    unittest.main()
