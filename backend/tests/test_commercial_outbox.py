import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from fde_commercial.adapters import LocalCommercialAdapter
from fde_commercial.applications import create_application
from fde_commercial.db import connect, initialize
from fde_commercial.outbox import dispatch_pending


VALID_PAYLOAD = {
    "product_code": "FDE-TRAINING-SMALL-CLASS",
    "offer_id": "fde-small-class-open-application",
    "name": "张三",
    "mobile": "13800138000",
    "wechat": "",
    "current_role": "产品经理",
    "ai_experience": "practitioner",
    "fde_experience": "参与过知识库项目",
    "learning_goal": "建立完整企业 AI 交付能力",
    "time_commitment": "每周 10 小时",
    "source": "public_test",
    "consent_version": "training-application-v1",
    "_company": "",
}


class RecordingAdapter(LocalCommercialAdapter):
    def __init__(self):
        self.applications = []

    def sync_lead(self, application):
        self.applications.append(application)
        return super().sync_lead(application)


class FailingAdapter(LocalCommercialAdapter):
    def sync_lead(self, application):
        raise RuntimeError("张三 13800138000 must never be persisted as an error")


class CommercialOutboxTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.conn = connect(self.temp.name)
        self.now = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)
        initialize(self.conn, self.now)

    def tearDown(self):
        self.conn.close()
        self.temp.close()

    def test_local_adapter_returns_stable_local_reference(self):
        adapter = LocalCommercialAdapter()
        self.assertEqual(
            adapter.sync_lead({"public_id": "FDE-A-ABC1234567"}),
            "local:FDE-A-ABC1234567",
        )
        self.assertEqual(
            adapter.sync_opportunity({"id": 42}),
            "local:opportunity:42",
        )
        self.assertIsNone(adapter.get_contract_status("contract-1"))
        self.assertIsNone(adapter.get_payment_status("payment-1"))

    def test_success_marks_message_delivered_and_preserves_payload(self):
        create_application(self.conn, VALID_PAYLOAD, "outbox-success", self.now)
        original = self.conn.execute(
            "SELECT payload_json FROM commercial_outbox"
        ).fetchone()[0]
        adapter = RecordingAdapter()

        result = dispatch_pending(self.conn, adapter, self.now)

        row = self.conn.execute("SELECT * FROM commercial_outbox").fetchone()
        self.assertEqual(result, {"claimed": 1, "delivered": 1, "failed": 0, "dead": 0})
        self.assertEqual(row["status"], "delivered")
        self.assertEqual(row["attempt_count"], 0)
        self.assertEqual(row["payload_json"], original)
        self.assertEqual(adapter.applications[0]["name"], "张三")
        self.assertEqual(adapter.applications[0]["mobile"], "13800138000")

    def test_failure_retries_with_backoff_without_persisting_pii_error(self):
        create_application(self.conn, VALID_PAYLOAD, "outbox-failure", self.now)
        original = self.conn.execute(
            "SELECT payload_json FROM commercial_outbox"
        ).fetchone()[0]

        first = dispatch_pending(self.conn, FailingAdapter(), self.now)
        row = self.conn.execute("SELECT * FROM commercial_outbox").fetchone()
        self.assertEqual(first, {"claimed": 1, "delivered": 0, "failed": 1, "dead": 0})
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["attempt_count"], 1)
        self.assertGreater(row["available_at"], self.now.isoformat().replace("+00:00", "Z"))
        self.assertEqual(row["last_error"], "RuntimeError")
        self.assertNotIn("张三", row["last_error"])
        self.assertNotIn("13800138000", row["last_error"])
        self.assertEqual(row["payload_json"], original)
        self.assertEqual(
            dispatch_pending(self.conn, FailingAdapter(), self.now)["claimed"], 0
        )

    def test_message_moves_to_dead_only_after_ten_failures(self):
        create_application(self.conn, VALID_PAYLOAD, "outbox-dead", self.now)
        adapter = FailingAdapter()
        current = self.now
        for attempt in range(1, 10):
            result = dispatch_pending(self.conn, adapter, current)
            row = self.conn.execute("SELECT * FROM commercial_outbox").fetchone()
            self.assertEqual(result["failed"], 1)
            self.assertEqual(row["attempt_count"], attempt)
            self.assertEqual(row["status"], "pending")
            current += timedelta(hours=2)

        result = dispatch_pending(self.conn, adapter, current)
        row = self.conn.execute("SELECT * FROM commercial_outbox").fetchone()
        self.assertEqual(result["dead"], 1)
        self.assertEqual(row["attempt_count"], 10)
        self.assertEqual(row["status"], "dead")
        self.assertEqual(json.loads(row["payload_json"])["public_id"], row["object_id"])


if __name__ == "__main__":
    unittest.main()
