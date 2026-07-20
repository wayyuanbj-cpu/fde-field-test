"""WSGI API for the public FDE training commercialization surface."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, make_server

from .applications import (
    ExistingApplicationError,
    OfferUnavailableError,
    ValidationError,
    create_application,
    public_product,
)
from .db import connect, initialize


MAX_BODY = 32 * 1024
PRODUCT_PATH = "/api/commercial/public/products/FDE-TRAINING-SMALL-CLASS"
APPLICATION_PATH = "/api/commercial/public/training-applications"
_PUBLIC_APPLICATION_FIELDS = ("public_id", "status", "message", "next_step")


def create_app(db_path: str, now_provider=None):
    now_provider = now_provider or (lambda: datetime.now(timezone.utc))
    setup = connect(db_path)
    try:
        initialize(setup, now_provider())
    finally:
        setup.close()

    def application(environ, start_response):
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path = environ.get("PATH_INFO", "")
        conn = connect(db_path)
        try:
            if method == "OPTIONS":
                return _response(start_response, 204)

            if path == "/api/commercial/health":
                if method != "GET":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                return _response(start_response, 200, {"status": "ok"})

            if path == PRODUCT_PATH:
                if method != "GET":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                item = public_product(conn, "FDE-TRAINING-SMALL-CLASS")
                if item is None:
                    return _response(start_response, 404, {"error": "not_found"})
                return _response(
                    start_response,
                    200,
                    item,
                    headers=[("Cache-Control", "public, max-age=60")],
                )

            if path == APPLICATION_PATH:
                if method != "POST":
                    return _response(start_response, 405, {"error": "method_not_allowed"})
                idempotency_key = environ.get("HTTP_IDEMPOTENCY_KEY", "")
                if not idempotency_key:
                    raise ValidationError("缺少 Idempotency-Key 请求头")
                created = create_application(
                    conn,
                    _read_json(environ),
                    idempotency_key,
                    now_provider(),
                )
                status = 200 if created["idempotent"] else 201
                public_result = {
                    key: created[key] for key in _PUBLIC_APPLICATION_FIELDS
                }
                return _response(
                    start_response,
                    status,
                    public_result,
                    headers=[("Cache-Control", "no-store")],
                )

            return _response(start_response, 404, {"error": "not_found"})
        except OverflowError:
            return _response(start_response, 413, {"error": "body_too_large"})
        except ValidationError as exc:
            return _response(
                start_response,
                400,
                {"error": "validation_error", "message": str(exc)},
            )
        except ExistingApplicationError:
            return _response(start_response, 409, {"error": "existing_application"})
        except OfferUnavailableError as exc:
            return _response(
                start_response,
                409,
                {
                    "error": "applications_closed",
                    "application_status": exc.status,
                },
            )
        except Exception:
            return _response(start_response, 500, {"error": "internal_error"})
        finally:
            conn.close()

    return application


def _read_json(environ) -> dict:
    try:
        size = int(environ.get("CONTENT_LENGTH") or "0")
    except ValueError as exc:
        raise ValidationError("无效的请求长度") from exc
    if size < 0:
        raise ValidationError("无效的请求长度")
    if size > MAX_BODY:
        raise OverflowError("body too large")
    raw = environ["wsgi.input"].read(size if size else MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        raise OverflowError("body too large")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValidationError("请求内容不是有效 JSON") from exc
    if not isinstance(payload, dict):
        raise ValidationError("请求内容必须是 JSON 对象")
    return payload


def _response(start_response, status: int, payload=None, headers=None):
    body = (
        b""
        if payload is None
        else json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
    )
    response_headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("X-Content-Type-Options", "nosniff"),
    ]
    response_headers.extend(headers or [])
    start_response(f"{status} {_status_text(status)}", response_headers)
    return [body]


def _status_text(status: int) -> str:
    return {
        200: "OK",
        201: "Created",
        204: "No Content",
        400: "Bad Request",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        413: "Payload Too Large",
        500: "Internal Server Error",
    }.get(status, "Error")


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def main() -> None:
    db_path = os.environ.get(
        "FDE_COMMERCIAL_DB", "/var/lib/fde-commercial/commercial.db"
    )
    host = os.environ.get("FDE_COMMERCIAL_HOST", "127.0.0.1")
    port = int(os.environ.get("FDE_COMMERCIAL_PORT", "8767"))
    app = create_app(db_path)
    with make_server(host, port, app, server_class=ThreadingWSGIServer) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
