"""Read-only public WSGI API for the OneX FDE talent network."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, make_server

from .db import connect, initialize, public_config


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
            if method != "GET":
                return _response(start_response, 405, {"error": "method_not_allowed"})
            if path == "/api/network/health":
                return _response(
                    start_response,
                    200,
                    {"status": "ok", "service": "fde_network"},
                )
            if path == "/api/network/config":
                return _response(
                    start_response,
                    200,
                    {"features": public_config(conn)},
                    [("Cache-Control", "public, max-age=30")],
                )
            return _response(start_response, 404, {"error": "not_found"})
        except Exception:
            return _response(start_response, 500, {"error": "internal_error"})
        finally:
            conn.close()

    return application


def _response(start_response, status: int, payload: dict, headers=None):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    response_headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("X-Content-Type-Options", "nosniff"),
    ]
    response_headers.extend(headers or [])
    labels = {200: "OK", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error"}
    start_response(f"{status} {labels[status]}", response_headers)
    return [body]


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def main() -> None:
    db_path = os.environ.get("FDE_NETWORK_DB", "/var/lib/fde-network/network.db")
    host = os.environ.get("FDE_NETWORK_HOST", "127.0.0.1")
    port = int(os.environ.get("FDE_NETWORK_PORT", "8766"))
    with make_server(host, port, create_app(db_path), server_class=ThreadingWSGIServer) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
