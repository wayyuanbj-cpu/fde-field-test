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
