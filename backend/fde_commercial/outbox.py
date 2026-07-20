"""Transactional dispatcher for reliable commercial adapter synchronization."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone

from .adapters import CommercialAdapter


MAX_ATTEMPTS = 10
MAX_BATCH_SIZE = 100

_LEAD_FIELDS = (
    "public_id",
    "name",
    "mobile",
    "wechat",
    "current_role",
    "ai_experience",
    "fde_experience",
    "learning_goal",
    "time_commitment",
    "source",
    "consent_version",
    "status",
    "mobile_verification_status",
)
_OPPORTUNITY_FIELDS = (
    "id",
    "application_id",
    "stage",
    "quoted_amount",
    "contract_external_id",
    "payment_external_id",
    "lost_reason",
    "owner_id",
)


def dispatch_pending(
    conn: sqlite3.Connection,
    adapter: CommercialAdapter,
    now: datetime,
    limit: int = 50,
) -> dict:
    """Claim available rows, dispatch them, and preserve every outcome."""

    if not isinstance(limit, int) or limit < 0:
        raise ValueError("limit must be a non-negative integer")
    limit = min(limit, MAX_BATCH_SIZE)
    result = {"claimed": 0, "delivered": 0, "failed": 0, "dead": 0}
    if limit == 0:
        return result

    stamp = _iso(now)
    with conn:
        candidates = conn.execute(
            """
            SELECT *
            FROM commercial_outbox
            WHERE status = 'pending' AND available_at <= ?
            ORDER BY id
            LIMIT ?
            """,
            (stamp, limit),
        ).fetchall()
        claimed = []
        for row in candidates:
            changed = conn.execute(
                """
                UPDATE commercial_outbox
                SET status = 'processing', updated_at = ?
                WHERE id = ? AND status = 'pending' AND available_at <= ?
                """,
                (stamp, row["id"], stamp),
            ).rowcount
            if changed:
                claimed.append(dict(row))

    result["claimed"] = len(claimed)
    for message in claimed:
        try:
            _dispatch_one(conn, adapter, message)
        except Exception as exc:
            attempt_count = int(message["attempt_count"]) + 1
            is_dead = attempt_count >= MAX_ATTEMPTS
            available_at = _iso(now + _backoff(attempt_count))
            with conn:
                conn.execute(
                    """
                    UPDATE commercial_outbox
                    SET status = ?, attempt_count = ?, available_at = ?,
                        last_error = ?, updated_at = ?
                    WHERE id = ? AND status = 'processing'
                    """,
                    (
                        "dead" if is_dead else "pending",
                        attempt_count,
                        available_at,
                        exc.__class__.__name__[:120],
                        stamp,
                        message["id"],
                    ),
                )
            if is_dead:
                result["dead"] += 1
            else:
                result["failed"] += 1
        else:
            with conn:
                conn.execute(
                    """
                    UPDATE commercial_outbox
                    SET status = 'delivered', last_error = NULL, updated_at = ?
                    WHERE id = ? AND status = 'processing'
                    """,
                    (stamp, message["id"]),
                )
            result["delivered"] += 1
    return result


def _dispatch_one(
    conn: sqlite3.Connection,
    adapter: CommercialAdapter,
    message: dict,
) -> str | None:
    payload = json.loads(message["payload_json"])
    if not isinstance(payload, dict):
        raise ValueError("outbox payload must be an object")

    if message["topic"] == "commercial.training_application.created":
        public_id = payload.get("public_id")
        row = conn.execute(
            "SELECT * FROM training_applications WHERE public_id = ?",
            (public_id,),
        ).fetchone()
        if row is None:
            raise LookupError("training application is missing")
        application = {field: row[field] for field in _LEAD_FIELDS}
        return adapter.sync_lead(application)

    if message["topic"] == "commercial.opportunity.changed":
        opportunity_id = payload.get("opportunity_id")
        row = conn.execute(
            "SELECT * FROM commercial_opportunities WHERE id = ?",
            (opportunity_id,),
        ).fetchone()
        if row is None:
            raise LookupError("commercial opportunity is missing")
        opportunity = {field: row[field] for field in _OPPORTUNITY_FIELDS}
        return adapter.sync_opportunity(opportunity)

    raise ValueError("unsupported outbox topic")


def _backoff(attempt_count: int) -> timedelta:
    seconds = min(3600, 60 * (2 ** max(0, attempt_count - 1)))
    return timedelta(seconds=seconds)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

