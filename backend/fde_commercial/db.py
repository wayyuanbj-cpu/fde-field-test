"""SQLite data foundation for the isolated FDE commercial service."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from datetime import datetime, timezone


SCHEMA_VERSION = 1

_SCHEMA_MIGRATIONS_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
)
"""

_MIGRATION_1_STATEMENTS = (
    """
    CREATE TABLE commercial_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type = 'training'),
        status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'archived')),
        capacity_per_cohort INTEGER NOT NULL CHECK (capacity_per_cohort BETWEEN 1 AND 10),
        application_mode TEXT NOT NULL CHECK (application_mode = 'review_required'),
        public_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE training_cohorts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        product_id INTEGER NOT NULL REFERENCES commercial_products(id),
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 10 CHECK (capacity BETWEEN 1 AND 10),
        starts_at TEXT,
        ends_at TEXT,
        status TEXT NOT NULL CHECK (
            status IN ('planning', 'recruiting', 'full', 'in_progress', 'completed', 'cancelled')
        ),
        confirmed_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_count BETWEEN 0 AND 10),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (confirmed_count <= capacity)
    )
    """,
    """
    CREATE TABLE commercial_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        product_id INTEGER NOT NULL REFERENCES commercial_products(id),
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'paused', 'waitlist_only', 'closed')),
        price_display TEXT,
        application_open INTEGER NOT NULL DEFAULT 1 CHECK (application_open IN (0, 1)),
        cohort_id INTEGER REFERENCES training_cohorts(id),
        starts_at TEXT,
        ends_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE training_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT NOT NULL UNIQUE,
        product_id INTEGER NOT NULL REFERENCES commercial_products(id),
        offer_id INTEGER NOT NULL REFERENCES commercial_offers(id),
        name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        wechat TEXT,
        current_role TEXT NOT NULL,
        ai_experience TEXT NOT NULL,
        fde_experience TEXT NOT NULL,
        learning_goal TEXT NOT NULL,
        time_commitment TEXT NOT NULL,
        source TEXT NOT NULL CHECK (
            source IN (
                'public_test', 'wechat_official', 'community', 'talent_page',
                'enterprise_referral', 'direct', 'other'
            )
        ),
        source_detail TEXT,
        consent_version TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
            status IN (
                'submitted', 'reviewing', 'contacted', 'qualified', 'waitlisted',
                'admitted', 'enrolled', 'rejected', 'withdrawn', 'closed'
            )
        ),
        assigned_operator_id TEXT,
        mobile_verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (
            mobile_verification_status IN ('pending', 'verified', 'failed')
        ),
        idempotency_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE commercial_opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL UNIQUE REFERENCES training_applications(id),
        stage TEXT NOT NULL CHECK (
            stage IN ('qualified', 'quoted', 'contract_pending', 'payment_pending', 'won', 'lost', 'refunded')
        ),
        quoted_amount TEXT,
        contract_external_id TEXT,
        payment_external_id TEXT,
        lost_reason TEXT CHECK (
            lost_reason IS NULL OR lost_reason IN (
                'not_a_fit', 'schedule_conflict', 'budget', 'no_response',
                'selected_other', 'other'
            )
        ),
        owner_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE training_enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL UNIQUE REFERENCES training_applications(id),
        cohort_id INTEGER NOT NULL REFERENCES training_cohorts(id),
        status TEXT NOT NULL CHECK (
            status IN ('reserved', 'confirmed', 'active', 'completed', 'withdrawn')
        ),
        seat_number INTEGER NOT NULL CHECK (seat_number BETWEEN 1 AND 10),
        payment_status TEXT NOT NULL CHECK (
            payment_status IN ('not_required', 'pending', 'paid', 'refunded')
        ),
        contract_status TEXT NOT NULL CHECK (
            contract_status IN ('not_required', 'pending', 'signed', 'cancelled')
        ),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (cohort_id, seat_number)
    )
    """,
    """
    CREATE TABLE commercial_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        occurred_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE commercial_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (
            status IN ('pending', 'processing', 'delivered', 'dead')
        ),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        available_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX idx_training_applications_product_mobile ON training_applications(product_id, mobile)",
    "CREATE INDEX idx_training_applications_status ON training_applications(status, created_at)",
    "CREATE INDEX idx_commercial_outbox_dispatch ON commercial_outbox(status, available_at, id)",
    """
    CREATE TRIGGER commercial_audit_events_no_update
    BEFORE UPDATE ON commercial_audit_events
    BEGIN
        SELECT RAISE(ABORT, 'commercial audit events are append-only');
    END
    """,
    """
    CREATE TRIGGER commercial_audit_events_no_delete
    BEFORE DELETE ON commercial_audit_events
    BEGIN
        SELECT RAISE(ABORT, 'commercial audit events are append-only');
    END
    """,
)

_FORBIDDEN_PAYLOAD_KEY_PARTS = (
    "password",
    "token",
    "csrf",
    "raw_ip",
    "full_user_agent",
    "id_number",
    "answer",
)


def connect(db_path: str) -> sqlite3.Connection:
    """Open a commercial database connection with production-safe pragmas."""

    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def initialize(conn: sqlite3.Connection, now: datetime | None = None) -> None:
    """Apply missing schema migrations exactly once."""

    stamp = _iso(now)
    with conn:
        conn.execute(_SCHEMA_MIGRATIONS_SQL)
        applied = conn.execute(
            "SELECT 1 FROM schema_migrations WHERE version = ?",
            (SCHEMA_VERSION,),
        ).fetchone()
        if applied is None:
            for statement in _MIGRATION_1_STATEMENTS:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)",
                (SCHEMA_VERSION, stamp),
            )
        _seed_defaults(conn, stamp)


def get_product_by_code(conn: sqlite3.Connection, code: str) -> dict | None:
    """Return an internal product record by its immutable code."""

    row = conn.execute(
        "SELECT * FROM commercial_products WHERE code = ?",
        (code,),
    ).fetchone()
    return dict(row) if row is not None else None


def append_audit(
    conn: sqlite3.Connection,
    *,
    actor: str,
    action: str,
    object_type: str,
    object_id: str,
    before: Mapping | None,
    after: Mapping | None,
    now: datetime | None = None,
) -> int:
    """Append a sanitized business audit event and return its row id."""

    _reject_secret_keys(before)
    _reject_secret_keys(after)
    cursor = conn.execute(
        """
        INSERT INTO commercial_audit_events(
            actor, action, object_type, object_id, before_json, after_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            actor,
            action,
            object_type,
            object_id,
            _json(before),
            _json(after),
            _iso(now),
        ),
    )
    return int(cursor.lastrowid)


def enqueue_outbox(
    conn: sqlite3.Connection,
    *,
    topic: str,
    object_type: str,
    object_id: str,
    payload: Mapping,
    now: datetime | None = None,
) -> int:
    """Append a sanitized integration message for reliable later delivery."""

    _reject_secret_keys(payload)
    stamp = _iso(now)
    cursor = conn.execute(
        """
        INSERT INTO commercial_outbox(
            topic, object_type, object_id, payload_json, status, attempt_count,
            available_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?)
        """,
        (
            topic,
            object_type,
            object_id,
            _json(payload),
            stamp,
            stamp,
            stamp,
        ),
    )
    return int(cursor.lastrowid)


def _seed_defaults(conn: sqlite3.Connection, stamp: str) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO commercial_products(
            code, name, type, status, capacity_per_cohort, application_mode,
            public_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "FDE-TRAINING-SMALL-CLASS",
            "OneX FDE 小班实战培训",
            "training",
            "active",
            10,
            "review_required",
            "/fde-training/",
            stamp,
            stamp,
        ),
    )
    product = conn.execute(
        "SELECT id FROM commercial_products WHERE code = ?",
        ("FDE-TRAINING-SMALL-CLASS",),
    ).fetchone()
    conn.execute(
        """
        INSERT OR IGNORE INTO commercial_offers(
            code, product_id, name, status, price_display, application_open,
            cohort_id, starts_at, ends_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        """,
        (
            "fde-small-class-open-application",
            product["id"],
            "FDE 小班首期申请",
            "open",
            "沟通后确认",
            1,
            stamp,
            stamp,
        ),
    )


def _reject_secret_keys(value) -> None:
    if value is None:
        return
    if isinstance(value, Mapping):
        for key, nested in value.items():
            normalized = str(key).casefold()
            if any(part in normalized for part in _FORBIDDEN_PAYLOAD_KEY_PARTS):
                raise ValueError(f"forbidden payload key: {key}")
            _reject_secret_keys(nested)
        return
    if isinstance(value, (list, tuple)):
        for nested in value:
            _reject_secret_keys(nested)


def _json(value: Mapping | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _iso(value: datetime | None) -> str:
    stamp = value or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
