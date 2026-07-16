import io
import json
import tempfile
import unittest
from datetime import datetime, timezone

from fde_analytics.app import create_app
from fde_analytics.auth import create_user
from fde_analytics.db import connect, initialize


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        conn = connect(self.temp.name)
        initialize(conn)
        self.owner = create_user(conn, "owner", "InitialPass!2026", "owner", True, now=self.now)
        self.analyst = create_user(conn, "analyst", "AnalystPass!2026", "analyst", False, now=self.now)
        conn.close()
        self.app = create_app(self.temp.name, now_provider=lambda: self.now)

    @property
    def now(self):
        return datetime(2026, 7, 16, 8, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.temp.close()

    def request(self, method, path, body=None, cookie=None, csrf=None, raw=None):
        query = ""
        if "?" in path:
            path, query = path.split("?", 1)
        payload = raw if raw is not None else (json.dumps(body).encode() if body is not None else b"")
        environ = {
            "REQUEST_METHOD": method,
            "PATH_INFO": path,
            "QUERY_STRING": query,
            "CONTENT_LENGTH": str(len(payload)),
            "CONTENT_TYPE": "application/json",
            "wsgi.input": io.BytesIO(payload),
            "wsgi.url_scheme": "https",
        }
        if cookie:
            environ["HTTP_COOKIE"] = cookie
        if csrf:
            environ["HTTP_X_CSRF_TOKEN"] = csrf
        captured = {}

        def start_response(status, headers):
            captured["status"] = int(status.split()[0])
            captured["headers"] = dict(headers)

        output = b"".join(self.app(environ, start_response))
        captured["json"] = json.loads(output) if output else None
        return captured

    def login(self, username, password):
        response = self.request("POST", "/api/analytics/auth/login", {"username": username, "password": password})
        cookie = response["headers"]["Set-Cookie"].split(";", 1)[0]
        return response, cookie

    def test_public_event_validation_and_body_limit(self):
        self.assertEqual(self.request("POST", "/api/analytics/events", raw=b"{")["status"], 400)
        self.assertEqual(self.request("POST", "/api/analytics/events", raw=b"x" * 17000)["status"], 413)
        valid = {
            "event": "page_view", "visitor_id": "visitor-1", "session_id": "session-1",
            "source": "direct", "device": "desktop", "locale": "en",
        }
        self.assertEqual(self.request("POST", "/api/analytics/events", valid)["status"], 204)

    def test_login_cookie_forced_change_and_csrf(self):
        self.assertEqual(self.request("GET", "/api/analytics/dashboard?range=7d")["status"], 401)
        login, cookie = self.login("owner", "InitialPass!2026")
        self.assertEqual(login["status"], 200)
        self.assertIn("Secure", login["headers"]["Set-Cookie"])
        self.assertIn("HttpOnly", login["headers"]["Set-Cookie"])
        self.assertIn("SameSite=Strict", login["headers"]["Set-Cookie"])
        self.assertTrue(login["json"]["user"]["must_change_password"])
        self.assertEqual(self.request("GET", "/api/analytics/dashboard?range=7d", cookie=cookie)["status"], 403)
        no_csrf = self.request("POST", "/api/analytics/auth/change-password", {
            "current_password": "InitialPass!2026", "new_password": "ChangedPass!2026",
        }, cookie=cookie)
        self.assertEqual(no_csrf["status"], 403)
        changed = self.request("POST", "/api/analytics/auth/change-password", {
            "current_password": "InitialPass!2026", "new_password": "ChangedPass!2026",
        }, cookie=cookie, csrf=login["json"]["csrf"])
        self.assertEqual(changed["status"], 200)
        changed_cookie = changed["headers"]["Set-Cookie"].split(";", 1)[0]
        self.assertFalse(changed["json"]["user"]["must_change_password"])
        self.assertEqual(self.request("GET", "/api/analytics/dashboard?range=7d", cookie=changed_cookie)["status"], 200)

    def test_owner_and_analyst_permissions(self):
        owner_login, owner_cookie = self.login("owner", "InitialPass!2026")
        changed = self.request("POST", "/api/analytics/auth/change-password", {
            "current_password": "InitialPass!2026", "new_password": "ChangedPass!2026",
        }, cookie=owner_cookie, csrf=owner_login["json"]["csrf"])
        owner_cookie = changed["headers"]["Set-Cookie"].split(";", 1)[0]
        owner_csrf = changed["json"]["csrf"]
        self.assertEqual(self.request("GET", "/api/analytics/users", cookie=owner_cookie)["status"], 200)
        created = self.request("POST", "/api/analytics/users", {"username": "newanalyst", "role": "analyst"}, cookie=owner_cookie, csrf=owner_csrf)
        self.assertEqual(created["status"], 201)
        self.assertIn("one_time_password", created["json"])

        analyst_login, analyst_cookie = self.login("analyst", "AnalystPass!2026")
        self.assertEqual(self.request("GET", "/api/analytics/dashboard?range=30d", cookie=analyst_cookie)["status"], 200)
        self.assertEqual(self.request("GET", "/api/analytics/users", cookie=analyst_cookie)["status"], 403)


if __name__ == "__main__":
    unittest.main()
