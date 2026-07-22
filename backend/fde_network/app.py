"""Read-only public WSGI API for the OneX FDE talent network."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, make_server
from urllib.parse import parse_qs

from .db import connect, initialize, public_config
from .talents import ValidationError, get_public_profile, list_public_profiles, normalize_filters


_DETAIL_PATH = re.compile(r"^/api/network/public/talents/([a-z0-9]+(?:-[a-z0-9]+)*)$")


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
                )
            if path == "/api/network/public/talents":
                if not _directory_enabled(conn):
                    return _response(start_response, 404, {"error": "not_found"})
                query = parse_qs(environ.get("QUERY_STRING", ""), keep_blank_values=True)
                filters = normalize_filters({key: values[-1] for key, values in query.items()})
                return _response(
                    start_response,
                    200,
                    {"items": list_public_profiles(conn, filters), "filters": filters},
                )
            detail_match = _DETAIL_PATH.fullmatch(path)
            if detail_match:
                if not _directory_enabled(conn):
                    return _response(start_response, 404, {"error": "not_found"})
                talent = get_public_profile(conn, detail_match.group(1))
                if talent is None:
                    return _response(start_response, 404, {"error": "not_found"})
                return _response(
                    start_response,
                    200,
                    {"talent": talent},
                )
            return _response(start_response, 404, {"error": "not_found"})
        except ValidationError as exc:
            return _response(start_response, 400, {"error": "validation_error", "message": str(exc)})
        except Exception:
            return _response(start_response, 500, {"error": "internal_error"})
        finally:
            conn.close()

    return application


def _directory_enabled(conn) -> bool:
    features = public_config(conn)
    return features["network_enabled"] and features["talent_directory_enabled"]


def _response(start_response, status: int, payload: dict, headers=None):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    response_headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("X-Content-Type-Options", "nosniff"),
        ("Cache-Control", "no-store"),
    ]
    response_headers.extend(headers or [])
    labels = {200: "OK", 400: "Bad Request", 404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error"}
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
