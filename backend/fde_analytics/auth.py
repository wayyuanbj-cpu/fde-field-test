import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta, timezone


PASSWORD_MIN = 12
SESSION_HOURS = 12
LOCK_MINUTES = 15
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PERMISSIONS = {
    "owner": {"analytics:read", "users:manage"},
    "analyst": {"analytics:read"},
}


class ValidationError(ValueError):
    pass


class PermissionDenied(Exception):
    pass


class AuthenticationError(Exception):
    def __init__(self, message="authentication failed", code="invalid"):
        super().__init__(message)
        self.code = code


def _utc(value=None):
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso(value=None):
    return _utc(value).isoformat(timespec="seconds")


def _parse(value):
    return datetime.fromisoformat(value) if value else None


def _validate_password(password):
    if not isinstance(password, str) or len(password) < PASSWORD_MIN or len(password) > 256:
        raise ValidationError(f"password must be {PASSWORD_MIN}-256 characters")


def _hash_password(password, salt):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=64)


def _public_user(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "active": bool(row["active"]),
        "must_change_password": bool(row["must_change_password"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_login_at": row["last_login_at"],
    }


def _audit(conn, actor_id, action, target_id=None, details=None, now=None):
    safe = details or {}
    forbidden = {"password", "token", "csrf", "ip", "session"}
    if any(any(word in key.lower() for word in forbidden) for key in safe):
        raise ValidationError("secret fields are forbidden in audit details")
    conn.execute(
        "INSERT INTO audit_log(actor_user_id,action,target_user_id,details,occurred_at) VALUES(?,?,?,?,?)",
        (actor_id, action, target_id, json.dumps(safe, ensure_ascii=False, separators=(",", ":")), _iso(now)),
    )


def _assert_owner(conn, actor_id):
    row = conn.execute("SELECT role,active FROM users WHERE id=?", (actor_id,)).fetchone()
    if not row or not row["active"] or row["role"] != "owner":
        raise PermissionDenied("owner permission required")


def create_user(conn, username, password, role="analyst", must_change_password=True, actor_id=None, now=None):
    if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
        raise ValidationError("username must be 3-32 safe characters")
    if role not in PERMISSIONS:
        raise ValidationError("invalid role")
    _validate_password(password)
    if actor_id is not None:
        _assert_owner(conn, actor_id)
    salt = secrets.token_bytes(16)
    password_hash = _hash_password(password, salt)
    stamp = _iso(now)
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO users(username,password_salt,password_hash,role,active,must_change_password,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)",
                (username, salt, password_hash, role, int(bool(must_change_password)), stamp, stamp),
            )
            _audit(conn, actor_id, "user.create", cursor.lastrowid, {"username": username, "role": role}, now)
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise ValidationError("username already exists") from exc
        raise
    return get_user(conn, cursor.lastrowid)


def get_user(conn, user_id):
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return _public_user(row) if row else None


def list_users(conn):
    return [_public_user(row) for row in conn.execute("SELECT * FROM users ORDER BY id")]


def verify_login(conn, username, password, now=None):
    instant = _utc(now)
    row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        raise AuthenticationError()
    if not row["active"]:
        raise AuthenticationError("account disabled", "disabled")
    locked_until = _parse(row["lock_until"])
    if locked_until and instant < locked_until:
        raise AuthenticationError("account temporarily locked", "locked")
    valid = isinstance(password, str) and hmac.compare_digest(row["password_hash"], _hash_password(password, row["password_salt"]))
    if not valid:
        failures = row["failed_count"] + 1
        lock_until = _iso(instant + timedelta(minutes=LOCK_MINUTES)) if failures >= 5 else None
        with conn:
            conn.execute(
                "UPDATE users SET failed_count=?,lock_until=?,updated_at=? WHERE id=?",
                (0 if lock_until else failures, lock_until, _iso(instant), row["id"]),
            )
            _audit(conn, row["id"], "auth.login_failed", row["id"], {"locked": bool(lock_until)}, instant)
        raise AuthenticationError()
    with conn:
        conn.execute(
            "UPDATE users SET failed_count=0,lock_until=NULL,last_login_at=?,updated_at=? WHERE id=?",
            (_iso(instant), _iso(instant), row["id"]),
        )
        _audit(conn, row["id"], "auth.login", row["id"], {}, instant)
    return get_user(conn, row["id"])


def create_session(conn, user_id, now=None):
    instant = _utc(now)
    row = conn.execute("SELECT auth_version,active FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not row["active"]:
        raise AuthenticationError("account disabled", "disabled")
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    token_hash = hashlib.sha256(token.encode()).digest()
    csrf_hash = hashlib.sha256(csrf.encode()).digest()
    with conn:
        conn.execute(
            "INSERT INTO sessions(token_hash,csrf_hash,user_id,auth_version,created_at,expires_at) VALUES(?,?,?,?,?,?)",
            (token_hash, csrf_hash, user_id, row["auth_version"], _iso(instant), _iso(instant + timedelta(hours=SESSION_HOURS))),
        )
    return token, csrf


def authenticate_session(conn, token, now=None):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).digest()
    row = conn.execute(
        "SELECT u.*,s.auth_version session_version,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?",
        (token_hash,),
    ).fetchone()
    if not row or not row["active"] or row["auth_version"] != row["session_version"] or _utc(now) >= _parse(row["expires_at"]):
        return None
    return _public_user(row)


def verify_csrf(conn, token, csrf, now=None):
    if not token or not csrf or not authenticate_session(conn, token, now):
        return False
    row = conn.execute("SELECT csrf_hash FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).digest(),)).fetchone()
    return bool(row) and hmac.compare_digest(row["csrf_hash"], hashlib.sha256(csrf.encode()).digest())


def revoke_session(conn, token):
    if token:
        with conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).digest(),))


def require_permission(user, permission):
    if not user or not user.get("active") or permission not in PERMISSIONS.get(user.get("role"), set()):
        raise PermissionDenied("permission denied")
    if user.get("must_change_password") and permission != "change:password":
        raise PermissionDenied("password change required")
    return True


def change_password(conn, user_id, current_password, new_password, now=None):
    _validate_password(new_password)
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not hmac.compare_digest(row["password_hash"], _hash_password(current_password, row["password_salt"])):
        raise AuthenticationError()
    salt = secrets.token_bytes(16)
    with conn:
        conn.execute(
            "UPDATE users SET password_salt=?,password_hash=?,must_change_password=0,auth_version=auth_version+1,updated_at=? WHERE id=?",
            (salt, _hash_password(new_password, salt), _iso(now), user_id),
        )
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        _audit(conn, user_id, "user.password_change", user_id, {}, now)
    return get_user(conn, user_id)


def _protect_last_owner(conn, target_id, new_role=None, new_active=None):
    row = conn.execute("SELECT role,active FROM users WHERE id=?", (target_id,)).fetchone()
    if not row:
        raise ValidationError("user not found")
    removes_owner = row["role"] == "owner" and row["active"] and (new_role == "analyst" or new_active is False)
    if removes_owner:
        count = conn.execute("SELECT COUNT(*) FROM users WHERE role='owner' AND active=1").fetchone()[0]
        if count <= 1:
            raise ValidationError("cannot remove the last active owner")


def set_user_role(conn, actor_id, target_id, role, now=None):
    _assert_owner(conn, actor_id)
    if role not in PERMISSIONS:
        raise ValidationError("invalid role")
    _protect_last_owner(conn, target_id, new_role=role)
    with conn:
        conn.execute("UPDATE users SET role=?,auth_version=auth_version+1,updated_at=? WHERE id=?", (role, _iso(now), target_id))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (target_id,))
        _audit(conn, actor_id, "user.role", target_id, {"role": role}, now)
    return get_user(conn, target_id)


def set_user_active(conn, actor_id, target_id, active, now=None):
    _assert_owner(conn, actor_id)
    _protect_last_owner(conn, target_id, new_active=bool(active))
    with conn:
        conn.execute("UPDATE users SET active=?,auth_version=auth_version+1,updated_at=? WHERE id=?", (int(bool(active)), _iso(now), target_id))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (target_id,))
        _audit(conn, actor_id, "user.active", target_id, {"active": bool(active)}, now)
    return get_user(conn, target_id)


def reset_password(conn, actor_id, target_id, new_password, now=None):
    _assert_owner(conn, actor_id)
    _validate_password(new_password)
    salt = secrets.token_bytes(16)
    with conn:
        conn.execute(
            "UPDATE users SET password_salt=?,password_hash=?,must_change_password=1,auth_version=auth_version+1,failed_count=0,lock_until=NULL,updated_at=? WHERE id=?",
            (salt, _hash_password(new_password, salt), _iso(now), target_id),
        )
        conn.execute("DELETE FROM sessions WHERE user_id=?", (target_id,))
        _audit(conn, actor_id, "user.password_reset", target_id, {}, now)
    return get_user(conn, target_id)


def unlock_user(conn, actor_id, target_id, now=None):
    _assert_owner(conn, actor_id)
    with conn:
        conn.execute("UPDATE users SET failed_count=0,lock_until=NULL,updated_at=? WHERE id=?", (_iso(now), target_id))
        _audit(conn, actor_id, "user.unlock", target_id, {}, now)
    return get_user(conn, target_id)
