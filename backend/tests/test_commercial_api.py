import io
import json
import tempfile
import unittest
from datetime import datetime, timezone

from fde_commercial.app import create_app
from fde_commercial.db import connect


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


class CommercialApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.now = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)
        self.app = create_app(self.temp.name, now_provider=lambda: self.now)

    def tearDown(self):
        self.temp.close()

    def request(self, method, path, body=None, raw=None, idempotency_key=None):
        payload = raw if raw is not None else (
            json.dumps(body, ensure_ascii=False).encode("utf-8")
            if body is not None
            else b""
        )
        environ = {
            "REQUEST_METHOD": method,
            "PATH_INFO": path,
            "CONTENT_LENGTH": str(len(payload)),
            "CONTENT_TYPE": "application/json",
            "wsgi.input": io.BytesIO(payload),
            "wsgi.url_scheme": "https",
        }
        if idempotency_key is not None:
            environ["HTTP_IDEMPOTENCY_KEY"] = idempotency_key
        captured = {}

        def start_response(status, headers):
            captured["status"] = int(status.split()[0])
            captured["headers"] = dict(headers)

        output = b"".join(self.app(environ, start_response))
        captured["json"] = json.loads(output) if output else None
        return captured

    def test_health_and_public_product(self):
        health = self.request("GET", "/api/commercial/health")
        self.assertEqual(health["status"], 200)
        self.assertEqual(health["json"], {"status": "ok"})
        product = self.request(
            "GET",
            "/api/commercial/public/products/FDE-TRAINING-SMALL-CLASS",
        )
        self.assertEqual(product["status"], 200)
        self.assertEqual(product["json"]["capacity_per_cohort"], 10)
        self.assertEqual(product["json"]["application_status"], "open")
        self.assertEqual(
            product["headers"]["Content-Type"], "application/json; charset=utf-8"
        )

    def test_valid_and_repeated_idempotent_application(self):
        first = self.request(
            "POST",
            "/api/commercial/public/training-applications",
            VALID_PAYLOAD,
            idempotency_key="api-idem-001",
        )
        second = self.request(
            "POST",
            "/api/commercial/public/training-applications",
            VALID_PAYLOAD,
            idempotency_key="api-idem-001",
        )
        self.assertEqual(first["status"], 201)
        self.assertEqual(second["status"], 200)
        self.assertEqual(first["json"], second["json"])
        self.assertEqual(
            set(first["json"]), {"public_id", "status", "message", "next_step"}
        )

    def test_public_validation_and_body_limit(self):
        missing_key = self.request(
            "POST", "/api/commercial/public/training-applications", VALID_PAYLOAD
        )
        malformed = self.request(
            "POST",
            "/api/commercial/public/training-applications",
            raw=b"{",
            idempotency_key="api-idem-002",
        )
        oversized = self.request(
            "POST",
            "/api/commercial/public/training-applications",
            raw=b"x" * (32 * 1024 + 1),
            idempotency_key="api-idem-003",
        )
        self.assertEqual(missing_key["status"], 400)
        self.assertEqual(malformed["status"], 400)
        self.assertEqual(oversized["status"], 413)

    def test_closed_offer_and_existing_mobile_are_conflicts(self):
        conn = connect(self.temp.name)
        with conn:
            conn.execute(
                "UPDATE commercial_offers SET status = 'closed', application_open = 0"
            )
        conn.close()
        closed = self.request(
            "POST",
            "/api/commercial/public/training-applications",
            VALID_PAYLOAD,
            idempotency_key="api-closed-001",
        )
        self.assertEqual(closed["status"], 409)
        self.assertEqual(closed["json"]["error"], "applications_closed")

        conn = connect(self.temp.name)
        with conn:
            conn.execute(
                "UPDATE commercial_offers SET status = 'open', application_open = 1"
            )
        conn.close()
        self.assertEqual(
            self.request(
                "POST",
                "/api/commercial/public/training-applications",
                VALID_PAYLOAD,
                idempotency_key="api-first-001",
            )["status"],
            201,
        )
        duplicate = self.request(
            "POST",
            "/api/commercial/public/training-applications",
            VALID_PAYLOAD,
            idempotency_key="api-other-001",
        )
        self.assertEqual(duplicate["status"], 409)
        self.assertEqual(duplicate["json"], {"error": "existing_application"})

    def test_unknown_path_and_wrong_method(self):
        self.assertEqual(self.request("GET", "/missing")["status"], 404)
        self.assertEqual(
            self.request("POST", "/api/commercial/health")["status"], 405
        )


if __name__ == "__main__":
    unittest.main()
