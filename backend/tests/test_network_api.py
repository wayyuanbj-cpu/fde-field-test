import io
import json
import tempfile
import unittest
from datetime import datetime, timezone

from fde_network.app import create_app


class NetworkApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.now = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
        self.app = create_app(self.temp.name, lambda: self.now)

    def tearDown(self):
        self.temp.close()

    def request(self, method, path):
        state = {}

        def start_response(status, headers):
            state["status"] = int(status.split()[0])
            state["headers"] = dict(headers)

        body = b"".join(
            self.app(
                {
                    "REQUEST_METHOD": method,
                    "PATH_INFO": path,
                    "QUERY_STRING": "",
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
        self.assertEqual(config["headers"]["Cache-Control"], "public, max-age=30")

    def test_unknown_path_and_wrong_method_are_bounded(self):
        self.assertEqual(self.request("POST", "/api/network/config")["status"], 405)
        self.assertEqual(self.request("GET", "/private/path")["status"], 404)


if __name__ == "__main__":
    unittest.main()
