import json
import os
import re
import secrets
import string
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs
from wsgiref.simple_server import WSGIServer, make_server

from .auth import (
    AuthenticationError,
    PermissionDenied,
    ValidationError as AuthValidationError,
    authenticate_session,
    change_password,
    create_session,
    create_user,
    get_user,
    list_users,
    require_permission,
    reset_password,
    revoke_session,
    rotate_csrf,
    set_user_active,
    set_user_role,
    verify_csrf,
    verify_login,
)
from .db import ValidationError as EventValidationError
from .db import connect, dashboard, initialize, record_event


MAX_BODY = 16 * 1024
USER_PATH = re.compile(r"^/api/analytics/users/(\d+)$")
RESET_PATH = re.compile(r"^/api/analytics/users/(\d+)/reset-password$")


def _password():
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(20))


def _cookie_token(environ):
    cookie = SimpleCookie()
    try:
        cookie.load(environ.get("HTTP_COOKIE", ""))
        return cookie["fde_admin_session"].value if "fde_admin_session" in cookie else None
    except Exception:
        return None


def _session_cookie(token):
    return f"fde_admin_session={token}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Strict"


def _clear_cookie():
    return "fde_admin_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict"


def _read_json(environ):
    try:
        size = int(environ.get("CONTENT_LENGTH") or "0")
    except ValueError as exc:
        raise EventValidationError("invalid content length") from exc
    if size > MAX_BODY:
        raise OverflowError("body too large")
    raw = environ["wsgi.input"].read(size if size else MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        raise OverflowError("body too large")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise EventValidationError("malformed json") from exc
    if not isinstance(payload, dict):
        raise EventValidationError("json object required")
    return payload


def _response(start_response, status, payload=None, headers=None, admin=True):
    body = b"" if payload is None else json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    response_headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
    ]
    if admin:
        response_headers.append(("Cache-Control", "no-store"))
    response_headers.extend(headers or [])
    start_response(f"{status} {_status_text(status)}", response_headers)
    return [body]


def _status_text(status):
    return {
        200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized",
        403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
        413: "Payload Too Large", 500: "Internal Server Error",
    }.get(status, "Error")


def create_app(db_path, now_provider=None):
    now_provider = now_provider or (lambda: datetime.now(timezone.utc))

    def application(environ, start_response):
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path = environ.get("PATH_INFO", "")
        conn = connect(db_path)
        initialize(conn)
        token = _cookie_token(environ)
        user = authenticate_session(conn, token, now_provider())

        def deny_auth():
            return _response(start_response, 401, {"error": "authentication_required"})

        def require_csrf_header():
            provided = environ.get("HTTP_X_CSRF_TOKEN", "")
            if not verify_csrf(conn, token, provided, now_provider()):
                raise PermissionDenied("invalid csrf token")

        try:
            if method == "OPTIONS":
                return _response(start_response, 204)

            if path == "/api/analytics/events":
                if method != "POST":
                    return _response(start_response, 405, {"error": "method_not_allowed"}, admin=False)
                record_event(conn, _read_json(environ), now_provider())
                return _response(start_response, 204, admin=False)

            if path == "/api/analytics/auth/login":
                if method != "POST":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                payload = _read_json(environ)
                logged_in = verify_login(conn, payload.get("username"), payload.get("password"), now_provider())
                session_token, csrf = create_session(conn, logged_in["id"], now_provider())
                return _response(start_response, 200, {"user": logged_in, "csrf": csrf}, [("Set-Cookie", _session_cookie(session_token))])

            if path == "/api/analytics/auth/me":
                if method != "GET":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                if not user:
                    return deny_auth()
                csrf = rotate_csrf(conn, token)
                return _response(start_response, 200, {"user": user, "csrf": csrf})

            if path == "/api/analytics/auth/logout":
                if method != "POST":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                if not user:
                    return deny_auth()
                require_csrf_header()
                revoke_session(conn, token)
                return _response(start_response, 204, headers=[("Set-Cookie", _clear_cookie())])

            if path == "/api/analytics/auth/change-password":
                if method != "POST":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                if not user:
                    return deny_auth()
                require_csrf_header()
                payload = _read_json(environ)
                changed = change_password(conn, user["id"], payload.get("current_password"), payload.get("new_password"), now_provider())
                session_token, csrf = create_session(conn, changed["id"], now_provider())
                return _response(start_response, 200, {"user": changed, "csrf": csrf}, [("Set-Cookie", _session_cookie(session_token))])

            if path == "/api/analytics/dashboard":
                if method != "GET":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                if not user:
                    return deny_auth()
                require_permission(user, "analytics:read")
                range_key = parse_qs(environ.get("QUERY_STRING", "")).get("range", ["7d"])[0]
                return _response(start_response, 200, dashboard(conn, range_key, now_provider()))

            if path == "/api/analytics/users":
                if not user:
                    return deny_auth()
                require_permission(user, "users:manage")
                if method == "GET":
                    return _response(start_response, 200, {"users": list_users(conn)})
                if method == "POST":
                    require_csrf_header()
                    payload = _read_json(environ)
                    one_time = _password()
                    created = create_user(conn, payload.get("username"), one_time, payload.get("role", "analyst"), True, user["id"], now_provider())
                    return _response(start_response, 201, {"user": created, "one_time_password": one_time})
                return _response(start_response, 405, {"error": "method_not_allowed"})

            match = RESET_PATH.match(path)
            if match:
                if method != "POST":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                if not user:
                    return deny_auth()
                require_permission(user, "users:manage")
                require_csrf_header()
                target_id = int(match.group(1))
                one_time = _password()
                changed = reset_password(conn, user["id"], target_id, one_time, now_provider())
                return _response(start_response, 200, {"user": changed, "one_time_password": one_time})

            match = USER_PATH.match(path)
            if match:
                if method != "PATCH":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                if not user:
                    return deny_auth()
                require_permission(user, "users:manage")
                require_csrf_header()
                target_id = int(match.group(1))
                payload = _read_json(environ)
                allowed = set(payload) & {"role", "active"}
                if not allowed or set(payload) - {"role", "active"}:
                    raise AuthValidationError("role or active required")
                updated = get_user(conn, target_id)
                if "role" in payload:
                    updated = set_user_role(conn, user["id"], target_id, payload["role"], now_provider())
                if "active" in payload:
                    updated = set_user_active(conn, user["id"], target_id, bool(payload["active"]), now_provider())
                return _response(start_response, 200, {"user": updated})

            return _response(start_response, 404, {"error": "not_found"})
        except OverflowError:
            return _response(start_response, 413, {"error": "body_too_large"}, admin=path != "/api/analytics/events")
        except (EventValidationError, AuthValidationError) as exc:
            return _response(start_response, 400, {"error": "validation_error", "message": str(exc)}, admin=path != "/api/analytics/events")
        except AuthenticationError as exc:
            return _response(start_response, 401, {"error": exc.code})
        except PermissionDenied as exc:
            return _response(start_response, 403, {"error": "permission_denied", "message": str(exc)})
        except Exception:
            return _response(start_response, 500, {"error": "internal_error"}, admin=path != "/api/analytics/events")
        finally:
            conn.close()

    return application


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def main():
    db_path = os.environ.get("FDE_ANALYTICS_DB", "/var/lib/fde-analytics/analytics.db")
    host = os.environ.get("FDE_ANALYTICS_HOST", "127.0.0.1")
    port = int(os.environ.get("FDE_ANALYTICS_PORT", "8765"))
    app = create_app(db_path)
    with make_server(host, port, app, server_class=ThreadingWSGIServer) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
