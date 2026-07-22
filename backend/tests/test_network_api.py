import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fde_network.app import create_app
from fde_network.db import connect, initialize, set_feature_flag
from fde_network.talents import publish_profile, save_profile
from backend.tests.test_network_db import PROFILE_PAYLOAD


class NetworkApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.now = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
        self.app = create_app(self.temp.name, lambda: self.now)

    def tearDown(self):
        self.temp.close()

    def request(self, method, path):
        state = {}
        parsed = urlsplit(path)

        def start_response(status, headers):
            state["status"] = int(status.split()[0])
            state["headers"] = dict(headers)

        body = b"".join(
            self.app(
                {
                    "REQUEST_METHOD": method,
                    "PATH_INFO": parsed.path,
                    "QUERY_STRING": parsed.query,
                    "wsgi.input": io.BytesIO(b""),
                },
                start_response,
            )
        )
        state["json"] = json.loads(body) if body else None
        return state

    def test_health_and_public_config(self):
        health = self.request("GET", "/api/network/health")
        self.assertEqual(health["status"], 200)
        self.assertEqual(health["json"], {"status": "ok", "service": "fde_network"})
        config = self.request("GET", "/api/network/config")
        self.assertEqual(config["status"], 200)
        self.assertEqual(
            config["json"]["features"],
            {"network_enabled": False, "talent_directory_enabled": False},
        )
        self.assertEqual(config["headers"]["Cache-Control"], "no-store")

    def test_unknown_path_and_wrong_method_are_bounded(self):
        self.assertEqual(self.request("POST", "/api/network/config")["status"], 405)
        self.assertEqual(self.request("GET", "/private/path")["status"], 404)

    def test_public_directory_requires_both_flags_and_never_serializes_private_name(self):
        conn = connect(self.temp.name)
        initialize(conn, self.now)
        profile = save_profile(conn, PROFILE_PAYLOAD, "operator:1", self.now)
        publish_profile(conn, profile["id"], "operator:1", self.now)
        conn.close()
        self.assertEqual(
            self.request("GET", "/api/network/public/talents")["status"],
            404,
        )

        conn = connect(self.temp.name)
        set_feature_flag(conn, "network_enabled", True, "owner:1", self.now)
        set_feature_flag(conn, "talent_directory_enabled", True, "owner:1", self.now)
        conn.close()
        listing = self.request(
            "GET",
            "/api/network/public/talents?status=member&city=%E5%8C%97%E4%BA%AC",
        )
        self.assertEqual(listing["status"], 200)
        self.assertEqual(listing["headers"]["Cache-Control"], "no-store")
        self.assertEqual(len(listing["json"]["items"]), 1)
        serialized = json.dumps(listing["json"], ensure_ascii=False)
        self.assertNotIn("虚构姓名", serialized)
        self.assertNotIn("real_name", serialized)
        detail = self.request(
            "GET",
            "/api/network/public/talents/manufacturing-kb-fde",
        )
        self.assertEqual(detail["status"], 200)
        self.assertEqual(detail["headers"]["Cache-Control"], "no-store")
        self.assertEqual(detail["json"]["talent"]["slug"], "manufacturing-kb-fde")
        self.assertEqual(
            self.request("GET", "/api/network/public/talents/missing")["status"],
            404,
        )

        conn = connect(self.temp.name)
        save_profile(
            conn,
            {**PROFILE_PAYLOAD, "public_authorized": False},
            "operator:1",
            self.now,
        )
        conn.close()
        revoked = self.request(
            "GET", "/api/network/public/talents/manufacturing-kb-fde"
        )
        self.assertEqual(revoked["status"], 404)
        self.assertEqual(revoked["headers"]["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
