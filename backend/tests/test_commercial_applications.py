import tempfile
import unittest
from datetime import datetime, timezone

from fde_commercial.applications import (
    ExistingApplicationError,
    ValidationError,
    create_application,
    find_active_application_by_mobile,
    public_product,
)
from fde_commercial.db import connect, initialize


VALID_PAYLOAD = {
    "product_code": "FDE-TRAINING-SMALL-CLASS",
    "offer_id": "fde-small-class-open-application",
    "name": " 张三 ",
    "mobile": "+86 138-0013-8000",
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


class CommercialApplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.conn = connect(self.temp.name)
        self.now = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)
        initialize(self.conn, self.now)

    def tearDown(self):
        self.conn.close()
        self.temp.close()

    def test_public_product_returns_only_sellable_copy(self):
        item = public_product(self.conn, "FDE-TRAINING-SMALL-CLASS")
        self.assertEqual(
            item,
            {
                "code": "FDE-TRAINING-SMALL-CLASS",
                "name": "OneX FDE 小班实战培训",
                "capacity_per_cohort": 10,
                "application_status": "open",
                "price_display": "沟通后确认",
                "public_path": "/fde-training/",
            },
        )

    def test_create_application_validates_and_normalizes_fields(self):
        created = create_application(self.conn, VALID_PAYLOAD, "idem-001", self.now)
        self.assertRegex(created["public_id"], r"^FDE-A-[A-Z0-9]{10}$")
        self.assertEqual(created["status"], "submitted")
        row = self.conn.execute("SELECT * FROM training_applications").fetchone()
        self.assertEqual(row["name"], "张三")
        self.assertEqual(row["mobile"], "13800138000")
        self.assertEqual(row["source"], "public_test")
        self.assertEqual(row["mobile_verification_status"], "pending")

    def test_honeypot_unknown_fields_and_oversized_text_are_rejected(self):
        with self.assertRaises(ValidationError):
            create_application(
                self.conn,
                {**VALID_PAYLOAD, "company_website": "bot"},
                "idem-002",
                self.now,
            )
        with self.assertRaises(ValidationError):
            create_application(
                self.conn,
                {**VALID_PAYLOAD, "_company": "bot"},
                "idem-003",
                self.now,
            )
        with self.assertRaises(ValidationError):
            create_application(
                self.conn,
                {**VALID_PAYLOAD, "learning_goal": "x" * 2001},
                "idem-004",
                self.now,
            )

    def test_same_idempotency_key_returns_same_application(self):
        first = create_application(self.conn, VALID_PAYLOAD, "same-key", self.now)
        second = create_application(self.conn, VALID_PAYLOAD, "same-key", self.now)
        self.assertEqual(first["public_id"], second["public_id"])
        self.assertFalse(first["idempotent"])
        self.assertTrue(second["idempotent"])
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM training_applications").fetchone()[0],
            1,
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM commercial_outbox").fetchone()[0],
            1,
        )

    def test_second_active_application_for_same_mobile_is_rejected(self):
        create_application(self.conn, VALID_PAYLOAD, "first-key", self.now)
        active = find_active_application_by_mobile(
            self.conn, 1, VALID_PAYLOAD["mobile"]
        )
        self.assertEqual(active["status"], "submitted")
        with self.assertRaises(ExistingApplicationError):
            create_application(self.conn, VALID_PAYLOAD, "other-key", self.now)


if __name__ == "__main__":
    unittest.main()
