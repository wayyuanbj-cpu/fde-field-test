"""Versioned data foundation for the isolated FDE talent network."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from datetime import datetime, timezone


SCHEMA_VERSION = 2
DEFAULT_FLAGS = {
    "network_enabled": False,
    "talent_directory_enabled": False,
}

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS talent_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    real_name TEXT NOT NULL,
    headline TEXT NOT NULL,
    city TEXT NOT NULL,
    service_mode TEXT NOT NULL CHECK (service_mode IN ('remote', 'onsite', 'hybrid')),
    availability TEXT NOT NULL CHECK (availability IN ('available', 'limited', 'unavailable')),
    status TEXT NOT NULL CHECK (status IN ('member', 'cert_pending', 'certified', 'delivery', 'inactive')),
    certification_status TEXT NOT NULL DEFAULT 'not_certified' CHECK (certification_status IN ('not_certified', 'pending', 'certified')),
    delivery_status TEXT NOT NULL DEFAULT 'unverified' CHECK (delivery_status IN ('unverified', 'verified')),
    summary TEXT NOT NULL,
    not_fit TEXT NOT NULL,
    service_package TEXT NOT NULL,
    evidence_summary TEXT NOT NULL,
    public_authorized INTEGER NOT NULL DEFAULT 0 CHECK (public_authorized IN (0, 1)),
    locale TEXT NOT NULL DEFAULT 'zh-CN' CHECK (locale IN ('zh-CN', 'en')),
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS talent_tags (
    profile_id INTEGER NOT NULL REFERENCES talent_profiles(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (profile_id, tag)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_talent_profiles_public
ON talent_profiles(published_at, status, city, availability);

CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'network audit events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'network audit events are append-only');
END;
"""

_PRIVATE_AUDIT_KEYS = (
    "real_name",
    "phone",
    "mobile",
    "email",
    "wechat",
    "id_number",
    "answer",
    "private_path",
    "client_name",
)


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def initialize(conn: sqlite3.Connection, now: datetime | None = None) -> None:
    stamp = _iso(now)
    with conn:
        conn.executescript(_SCHEMA_SQL)
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)",
            (stamp,),
        )
        _migrate_certification_and_delivery(conn, stamp)
        for key, enabled in DEFAULT_FLAGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO feature_flags(key, enabled, updated_at) VALUES(?,?,?)",
                (key, int(enabled), stamp),
            )


def _migrate_certification_and_delivery(conn: sqlite3.Connection, stamp: str) -> None:
    if conn.execute("SELECT 1 FROM schema_migrations WHERE version=2").fetchone():
        return
    columns = {row[1] for row in conn.execute("PRAGMA table_info(talent_profiles)")}
    if "certification_status" not in columns:
        conn.execute(
            """ALTER TABLE talent_profiles ADD COLUMN certification_status TEXT NOT NULL
            DEFAULT 'not_certified' CHECK (certification_status IN ('not_certified', 'pending', 'certified'))"""
        )
    if "delivery_status" not in columns:
        conn.execute(
            """ALTER TABLE talent_profiles ADD COLUMN delivery_status TEXT NOT NULL
            DEFAULT 'unverified' CHECK (delivery_status IN ('unverified', 'verified'))"""
        )
    conn.execute("UPDATE talent_profiles SET certification_status='certified' WHERE status='certified'")
    conn.execute("UPDATE talent_profiles SET delivery_status='verified' WHERE status='delivery'")
    conn.execute("INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)", (stamp,))


def public_config(conn: sqlite3.Connection) -> dict[str, bool]:
    rows = conn.execute(
        "SELECT key, enabled FROM feature_flags WHERE key IN (?, ?)",
        tuple(DEFAULT_FLAGS),
    ).fetchall()
    values = {row["key"]: bool(row["enabled"]) for row in rows}
    return {key: values.get(key, False) for key in DEFAULT_FLAGS}


def set_feature_flag(
    conn: sqlite3.Connection,
    key: str,
    enabled: bool,
    actor: str,
    now: datetime,
) -> dict:
    if key not in DEFAULT_FLAGS:
        raise ValueError("unknown feature flag")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be boolean")
    audit_actor = _required_text(actor, "actor", 120)
    stamp = _iso(now)
    with conn:
        current = conn.execute(
            "SELECT enabled FROM feature_flags WHERE key = ?",
            (key,),
        ).fetchone()
        before = bool(current["enabled"]) if current is not None else False
        conn.execute(
            """
            INSERT INTO feature_flags(key, enabled, updated_at) VALUES(?,?,?)
            ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at
            """,
            (key, int(enabled), stamp),
        )
        append_audit(
            conn,
            action="feature_flag.update",
            actor=audit_actor,
            object_type="feature_flag",
            object_id=key,
            before={"enabled": before},
            after={"enabled": enabled},
            now=now,
        )
    return {"key": key, "enabled": enabled, "updated_at": stamp}


def append_audit(
    conn: sqlite3.Connection,
    *,
    action: str,
    actor: str,
    object_type: str,
    object_id: str,
    before: Mapping | None,
    after: Mapping | None,
    now: datetime,
) -> int:
    _reject_private_keys(before)
    _reject_private_keys(after)
    cursor = conn.execute(
        """
        INSERT INTO audit_events(action, actor, object_type, object_id, before_json, after_json, occurred_at)
        VALUES(?,?,?,?,?,?,?)
        """,
        (
            action,
            actor,
            object_type,
            object_id,
            _json(before),
            _json(after),
            _iso(now),
        ),
    )
    return int(cursor.lastrowid)


def _reject_private_keys(value) -> None:
    if value is None:
        return
    if isinstance(value, Mapping):
        for key, nested in value.items():
            normalized = str(key).casefold()
            if any(private in normalized for private in _PRIVATE_AUDIT_KEYS):
                raise ValueError(f"private audit key: {key}")
            _reject_private_keys(nested)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _reject_private_keys(item)


def _required_text(value, field: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    normalized = value.strip()
    if not normalized or len(normalized) > maximum:
        raise ValueError(f"invalid {field}")
    return normalized


def _json(value) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _iso(value: datetime | None = None) -> str:
    stamp = value or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
