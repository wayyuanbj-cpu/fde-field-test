import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from fde_analytics.auth import (
    AuthenticationError,
    PermissionDenied,
    ValidationError,
    authenticate_session,
    change_password,
    create_session,
    create_user,
    require_permission,
    set_user_active,
    set_user_role,
    verify_csrf,
    verify_login,
)
from fde_analytics.db import connect, initialize


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.NamedTemporaryFile(suffix=".db")
        self.conn = connect(self.temp.name)
        initialize(self.conn)
        self.now = datetime(2026, 7, 16, 8, 0, tzinfo=timezone.utc)
        self.owner = create_user(self.conn, "owner", "InitialPass!2026", "owner", True, now=self.now)

    def tearDown(self):
        self.conn.close()
        self.temp.close()

    def test_scrypt_hash_and_password_rules(self):
        row = self.conn.execute("SELECT password_hash,password_salt FROM users WHERE id=?", (self.owner["id"],)).fetchone()
        self.assertNotIn(b"InitialPass!2026", row["password_hash"])
        self.assertEqual(len(row["password_hash"]), 64)
        with self.assertRaises(ValidationError):
            create_user(self.conn, "shortpass", "too-short", "analyst", now=self.now)

    def test_forced_change_and_permissions(self):
        login = verify_login(self.conn, "owner", "InitialPass!2026", self.now)
        self.assertTrue(login["must_change_password"])
        with self.assertRaises(PermissionDenied):
            require_permission(login, "users:manage")
        change_password(self.conn, self.owner["id"], "InitialPass!2026", "ChangedPass!2026", self.now)
        require_permission(verify_login(self.conn, "owner", "ChangedPass!2026", self.now), "users:manage")
        analyst = create_user(self.conn, "analyst", "AnalystPass!2026", "analyst", False, now=self.now)
        require_permission(analyst, "analytics:read")
        with self.assertRaises(PermissionDenied):
            require_permission(analyst, "users:manage")

    def test_five_failures_lock_account_for_fifteen_minutes(self):
        for _ in range(5):
            with self.assertRaises(AuthenticationError):
                verify_login(self.conn, "owner", "wrong-password", self.now)
        with self.assertRaises(AuthenticationError) as context:
            verify_login(self.conn, "owner", "InitialPass!2026", self.now + timedelta(minutes=1))
        self.assertEqual(context.exception.code, "locked")
        login = verify_login(self.conn, "owner", "InitialPass!2026", self.now + timedelta(minutes=16))
        self.assertEqual(login["username"], "owner")

    def test_session_expiry_csrf_and_auth_version_invalidation(self):
        token, csrf = create_session(self.conn, self.owner["id"], self.now)
        stored = self.conn.execute("SELECT token_hash,csrf_hash FROM sessions").fetchone()
        self.assertEqual(stored["token_hash"], hashlib.sha256(token.encode()).digest())
        self.assertNotEqual(stored["csrf_hash"], csrf.encode())
        self.assertEqual(authenticate_session(self.conn, token, self.now + timedelta(hours=11))["id"], self.owner["id"])
        self.assertIsNone(authenticate_session(self.conn, token, self.now + timedelta(hours=13)))
        token, csrf = create_session(self.conn, self.owner["id"], self.now)
        self.assertTrue(verify_csrf(self.conn, token, csrf, self.now))
        self.assertFalse(verify_csrf(self.conn, token, "wrong", self.now))
        change_password(self.conn, self.owner["id"], "InitialPass!2026", "ChangedPass!2026", self.now)
        self.assertIsNone(authenticate_session(self.conn, token, self.now))

    def test_disabled_user_and_last_owner_protection(self):
        analyst = create_user(self.conn, "analyst2", "AnalystPass!2026", "analyst", False, now=self.now)
        set_user_active(self.conn, self.owner["id"], analyst["id"], False, self.now)
        with self.assertRaises(AuthenticationError):
            verify_login(self.conn, "analyst2", "AnalystPass!2026", self.now)
        with self.assertRaises(ValidationError):
            set_user_active(self.conn, self.owner["id"], self.owner["id"], False, self.now)
        with self.assertRaises(ValidationError):
            set_user_role(self.conn, self.owner["id"], self.owner["id"], "analyst", self.now)

    def test_audit_log_redacts_secrets(self):
        token, csrf = create_session(self.conn, self.owner["id"], self.now)
        change_password(self.conn, self.owner["id"], "InitialPass!2026", "ChangedPass!2026", self.now)
        log = "\n".join(row[0] for row in self.conn.execute("SELECT details FROM audit_log"))
        for secret in ("InitialPass!2026", "ChangedPass!2026", token, csrf):
            self.assertNotIn(secret, log)
        for row in self.conn.execute("SELECT details FROM audit_log"):
            json.loads(row[0])


if __name__ == "__main__":
    unittest.main()
