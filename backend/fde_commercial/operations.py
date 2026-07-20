"""Auditable domain operations for FDE training admissions and cohorts."""

from __future__ import annotations

import sqlite3
import secrets
import string
from datetime import datetime, timezone

from .db import append_audit


TERMINAL_APPLICATION_STATUSES = {"rejected", "withdrawn", "closed"}
OFFER_STATUSES = {"open", "paused", "waitlist_only", "closed"}
APPLICATION_TRANSITIONS = {
    "submitted": {"reviewing", "rejected", "withdrawn", "closed"},
    "reviewing": {"contacted", "rejected", "withdrawn", "closed"},
    "contacted": {"qualified", "rejected", "withdrawn", "closed"},
    "qualified": {"waitlisted", "admitted", "rejected", "withdrawn", "closed"},
    "waitlisted": {"admitted", "rejected", "withdrawn", "closed"},
    "admitted": {"withdrawn", "closed"},
    "enrolled": set(),
    "rejected": set(),
    "withdrawn": set(),
    "closed": set(),
}


class ValidationError(ValueError):
    pass


class InvalidTransitionError(ValidationError):
    pass


class CohortFullError(ValidationError):
    pass


def create_cohort(
    conn: sqlite3.Connection,
    payload: dict,
    actor: str,
    now: datetime,
) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("cohort payload must be an object")
    if set(payload) - {"name", "capacity", "starts_at", "ends_at"}:
        raise ValidationError("unknown cohort fields")
    name = _text(payload.get("name"), "name", 120)
    capacity = payload.get("capacity", 10)
    if isinstance(capacity, bool) or not isinstance(capacity, int) or not 1 <= capacity <= 10:
        raise ValidationError("cohort capacity must be between 1 and 10")
    starts_at = _optional_iso(payload.get("starts_at"), "starts_at")
    ends_at = _optional_iso(payload.get("ends_at"), "ends_at")
    if starts_at and ends_at and ends_at <= starts_at:
        raise ValidationError("ends_at must be after starts_at")
    audit_actor = _text(actor, "actor", 120)
    stamp = _iso(now)
    code = _new_cohort_code()

    with conn:
        product = conn.execute(
            "SELECT id FROM commercial_products WHERE code = ?",
            ("FDE-TRAINING-SMALL-CLASS",),
        ).fetchone()
        if product is None:
            raise ValidationError("FDE training product not found")
        cursor = conn.execute(
            """
            INSERT INTO training_cohorts(
                code, product_id, name, capacity, starts_at, ends_at, status,
                confirmed_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'planning', 0, ?, ?)
            """,
            (
                code,
                product["id"],
                name,
                capacity,
                starts_at,
                ends_at,
                stamp,
                stamp,
            ),
        )
        cohort_id = int(cursor.lastrowid)
        append_audit(
            conn,
            actor=audit_actor,
            action="training_cohort.created",
            object_type="training_cohort",
            object_id=code,
            before=None,
            after={
                "name": name,
                "capacity": capacity,
                "status": "planning",
                "starts_at": starts_at,
                "ends_at": ends_at,
            },
            now=now,
        )
    return _cohort(conn, cohort_id)


def enroll_application(
    conn: sqlite3.Connection,
    application_id: int,
    cohort_id: int,
    actor: str,
    now: datetime,
) -> dict:
    audit_actor = _text(actor, "actor", 120)
    stamp = _iso(now)
    try:
        conn.execute("BEGIN IMMEDIATE")
        application = _application(conn, application_id)
        cohort = _cohort(conn, cohort_id)
        if application["status"] != "admitted":
            raise ValidationError("only admitted applications can be enrolled")
        if cohort["status"] in {"full", "in_progress", "completed", "cancelled"}:
            if cohort["status"] == "full":
                raise CohortFullError("cohort is full")
            raise ValidationError("cohort is not accepting enrollments")
        existing = conn.execute(
            "SELECT id FROM training_enrollments WHERE application_id = ?",
            (application_id,),
        ).fetchone()
        if existing is not None:
            raise ValidationError("application is already enrolled")

        used_seats = {
            row[0]
            for row in conn.execute(
                """
                SELECT seat_number
                FROM training_enrollments
                WHERE cohort_id = ? AND status != 'withdrawn'
                """,
                (cohort_id,),
            )
        }
        if len(used_seats) >= cohort["capacity"]:
            raise CohortFullError("cohort is full")
        seat_number = next(
            (
                number
                for number in range(1, cohort["capacity"] + 1)
                if number not in used_seats
            ),
            None,
        )
        if seat_number is None:
            raise CohortFullError("cohort is full")

        cursor = conn.execute(
            """
            INSERT INTO training_enrollments(
                application_id, cohort_id, status, seat_number, payment_status,
                contract_status, completed_at, created_at, updated_at
            ) VALUES (?, ?, 'confirmed', ?, 'not_required', 'not_required', NULL, ?, ?)
            """,
            (application_id, cohort_id, seat_number, stamp, stamp),
        )
        confirmed_count = len(used_seats) + 1
        cohort_status = "full" if confirmed_count >= cohort["capacity"] else "recruiting"
        conn.execute(
            """
            UPDATE training_cohorts
            SET confirmed_count = ?, status = ?, updated_at = ?
            WHERE id = ?
            """,
            (confirmed_count, cohort_status, stamp, cohort_id),
        )
        conn.execute(
            """
            UPDATE training_applications
            SET status = 'enrolled', status_reason = NULL, updated_at = ?
            WHERE id = ?
            """,
            (stamp, application_id),
        )
        enrollment_id = int(cursor.lastrowid)
        append_audit(
            conn,
            actor=audit_actor,
            action="training_enrollment.created",
            object_type="training_enrollment",
            object_id=str(enrollment_id),
            before=None,
            after={
                "application_public_id": application["public_id"],
                "cohort_code": cohort["code"],
                "seat_number": seat_number,
                "status": "confirmed",
            },
            now=now,
        )
        append_audit(
            conn,
            actor=audit_actor,
            action="training_application.transitioned",
            object_type="training_application",
            object_id=application["public_id"],
            before={"status": "admitted", "reason": application["status_reason"]},
            after={"status": "enrolled", "reason": None},
            now=now,
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    row = conn.execute(
        "SELECT * FROM training_enrollments WHERE id = ?",
        (enrollment_id,),
    ).fetchone()
    return dict(row)


def assign_application(
    conn: sqlite3.Connection,
    application_id: int,
    operator_id: str,
    actor: str,
    now: datetime,
) -> dict:
    operator = _text(operator_id, "operator_id", 120)
    audit_actor = _text(actor, "actor", 120)
    stamp = _iso(now)
    with conn:
        current = _application(conn, application_id)
        conn.execute(
            """
            UPDATE training_applications
            SET assigned_operator_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (operator, stamp, application_id),
        )
        append_audit(
            conn,
            actor=audit_actor,
            action="training_application.assigned",
            object_type="training_application",
            object_id=current["public_id"],
            before={"assigned_operator_id": current["assigned_operator_id"]},
            after={"assigned_operator_id": operator},
            now=now,
        )
    return _application(conn, application_id)


def set_offer_status(
    conn: sqlite3.Connection,
    offer_code: str,
    status: str,
    actor: str,
    now: datetime,
) -> dict:
    code = _text(offer_code, "offer_code", 120)
    next_status = _text(status, "status", 40)
    audit_actor = _text(actor, "actor", 120)
    if next_status not in OFFER_STATUSES:
        raise ValidationError("invalid offer status")
    stamp = _iso(now)
    with conn:
        current = conn.execute(
            "SELECT * FROM commercial_offers WHERE code = ?",
            (code,),
        ).fetchone()
        if current is None:
            raise ValidationError("commercial offer not found")
        if current["status"] == next_status:
            return dict(current)
        conn.execute(
            "UPDATE commercial_offers SET status = ?, updated_at = ? WHERE id = ?",
            (next_status, stamp, current["id"]),
        )
        append_audit(
            conn,
            actor=audit_actor,
            action="commercial_offer.status_changed",
            object_type="commercial_offer",
            object_id=code,
            before={"status": current["status"]},
            after={"status": next_status},
            now=now,
        )
    changed = conn.execute(
        "SELECT * FROM commercial_offers WHERE id = ?",
        (current["id"],),
    ).fetchone()
    return dict(changed)


def transition_application(
    conn: sqlite3.Connection,
    application_id: int,
    status: str,
    reason: str | None,
    actor: str,
    now: datetime,
) -> dict:
    next_status = _text(status, "status", 40)
    audit_actor = _text(actor, "actor", 120)
    normalized_reason = _optional_text(reason, "reason", 1000)
    if next_status in TERMINAL_APPLICATION_STATUSES and not normalized_reason:
        raise ValidationError("reason is required for terminal application status")

    stamp = _iso(now)
    with conn:
        current = _application(conn, application_id)
        allowed = APPLICATION_TRANSITIONS.get(current["status"], set())
        if next_status not in allowed:
            raise InvalidTransitionError(
                f"invalid application transition: {current['status']} -> {next_status}"
            )
        conn.execute(
            """
            UPDATE training_applications
            SET status = ?, status_reason = ?, updated_at = ?
            WHERE id = ?
            """,
            (next_status, normalized_reason, stamp, application_id),
        )
        append_audit(
            conn,
            actor=audit_actor,
            action="training_application.transitioned",
            object_type="training_application",
            object_id=current["public_id"],
            before={
                "status": current["status"],
                "reason": current["status_reason"],
            },
            after={"status": next_status, "reason": normalized_reason},
            now=now,
        )
    return _application(conn, application_id)


def _application(conn: sqlite3.Connection, application_id: int) -> dict:
    row = conn.execute(
        "SELECT * FROM training_applications WHERE id = ?",
        (application_id,),
    ).fetchone()
    if row is None:
        raise ValidationError("training application not found")
    return dict(row)


def _cohort(conn: sqlite3.Connection, cohort_id: int) -> dict:
    row = conn.execute(
        "SELECT * FROM training_cohorts WHERE id = ?",
        (cohort_id,),
    ).fetchone()
    if row is None:
        raise ValidationError("training cohort not found")
    return dict(row)


def _text(value, field: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text")
    normalized = value.strip()
    if not normalized or len(normalized) > maximum:
        raise ValidationError(f"invalid {field}")
    return normalized


def _optional_text(value, field: str, maximum: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text")
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > maximum:
        raise ValidationError(f"invalid {field}")
    return normalized


def _optional_iso(value, field: str) -> str | None:
    normalized = _optional_text(value, field, 50)
    if normalized is None:
        return None
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"invalid {field}") from exc
    return _iso(parsed)


def _new_cohort_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"FDE-C-{suffix}"


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
