import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from fde_analytics.db import (
    ValidationError,
    connect,
    dashboard,
    initialize,
    purge_old_events,
    record_event,
    validate_event,
)


BASE_EVENT = {
    "event": "page_view",
    "visitor_id": "visitor-1234567890",
    "session_id": "session-1234567890",
    "source": "direct",
    "device": "desktop",
    "locale": "zh-CN",
}


class AnalyticsDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.conn = connect(self.temp.name)
        initialize(self.conn)
        self.now = datetime(2026, 7, 16, 8, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.conn.close()
        self.temp.close()

    def test_rejects_unknown_or_sensitive_payloads(self):
        invalid = [
            {**BASE_EVENT, "event": "made_up"},
            {**BASE_EVENT, "extra": True},
            {**BASE_EVENT, "visitor_id": "x" * 129},
            {**BASE_EVENT, "level": "expert"},
            {**BASE_EVENT, "mode": "speedrun"},
            {**BASE_EVENT, "locale": "fr"},
            {**BASE_EVENT, "source": "raw-referrer"},
            {**BASE_EVENT, "score": 101},
            {**BASE_EVENT, "name": "someone"},
            {**BASE_EVENT, "answers": [1, 2]},
        ]
        for payload in invalid:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    validate_event(payload)

    def test_event_specific_fields_are_required_and_normalized(self):
        event = validate_event({
            "event": "level_complete",
            "visitor_id": "v-1",
            "session_id": "s-1",
            "level": "junior",
            "mode": "full",
            "score": 85,
            "source": "wechat",
            "device": "mobile",
        })
        self.assertEqual(event["score"], 85)
        with self.assertRaises(ValidationError):
            validate_event({**BASE_EVENT, "event": "level_complete"})

    def test_training_events_keep_only_coarse_source_and_result(self):
        event = validate_event({
            **BASE_EVENT,
            "event": "training_apply_submit",
            "source": "public_test",
            "result": "submitted",
        })
        self.assertEqual(event["source"], "public_test")
        self.assertEqual(event["result"], "submitted")
        with self.assertRaises(ValidationError):
            validate_event({
                **BASE_EVENT,
                "event": "training_apply_submit",
                "source": "public_test",
                "result": "submitted",
                "mobile": "13800138000",
            })
        with self.assertRaises(ValidationError):
            validate_event({
                **BASE_EVENT,
                "event": "training_apply_error",
                "source": "public_test",
                "result": "validation_with_name",
            })

    def test_dashboard_aggregates_anonymous_metrics(self):
        record_event(self.conn, BASE_EVENT, self.now)
        record_event(self.conn, {**BASE_EVENT, "session_id": "session-two", "source": "wechat"}, self.now)
        record_event(self.conn, {
            "event": "level_complete", "visitor_id": "visitor-1234567890", "session_id": "session-two",
            "source": "wechat", "device": "mobile", "level": "junior", "mode": "full", "score": 88,
        }, self.now)
        result = dashboard(self.conn, "7d", self.now)
        self.assertEqual(result["summary"], {"pv": 2, "uv": 1, "sessions": 2})
        self.assertEqual(result["funnel"]["page_view"], 2)
        self.assertEqual(result["levels"]["junior"]["complete"], 1)
        self.assertEqual(result["sources"][0], {"label": "wechat", "value": 2})
        self.assertEqual(result["scores"][0]["bucket"], "80-89")

    def test_migrates_legacy_events_and_aggregates_locale_and_ai_sources(self):
        legacy = tempfile.NamedTemporaryFile(suffix=".db")
        conn = connect(legacy.name)
        conn.execute("""
            CREATE TABLE events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, day TEXT NOT NULL,
                event TEXT NOT NULL, visitor_id TEXT NOT NULL, session_id TEXT NOT NULL,
                source TEXT NOT NULL, device TEXT NOT NULL, level TEXT, mode TEXT, score INTEGER
            )
        """)
        initialize(conn)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(events)")}
        self.assertIn("locale", columns)
        record_event(conn, {**BASE_EVENT, "visitor_id": "v-en", "session_id": "s-en", "source": "chatgpt", "locale": "en"}, self.now)
        record_event(conn, {**BASE_EVENT, "visitor_id": "v-zh", "session_id": "s-zh", "source": "direct", "locale": "zh-CN"}, self.now)
        result = dashboard(conn, "7d", self.now)
        self.assertEqual(result["locales"], [{"label": "en", "value": 1}, {"label": "zh-CN", "value": 1}])
        self.assertEqual(result["ai_sources"], [{"label": "chatgpt", "value": 1}])
        conn.close()
        legacy.close()

    def test_purge_keeps_daily_rollups(self):
        old = self.now - timedelta(days=181)
        record_event(self.conn, BASE_EVENT, old)
        removed = purge_old_events(self.conn, self.now)
        self.assertEqual(removed, 1)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM events").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT SUM(count) FROM daily_events WHERE event='page_view'").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
