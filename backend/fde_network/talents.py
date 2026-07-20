"""Private profile workflows and fixed public talent projections."""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime

from .db import append_audit, _iso


PROFILE_FIELDS = {
    "slug",
    "display_name",
    "real_name",
    "headline",
    "city",
    "service_mode",
    "availability",
    "status",
    "summary",
    "not_fit",
    "service_package",
    "evidence_summary",
    "tags",
    "public_authorized",
    "locale",
}
PUBLIC_FIELDS = (
    "slug",
    "display_name",
    "headline",
    "city",
    "service_mode",
    "availability",
    "status",
    "summary",
    "not_fit",
    "service_package",
    "evidence_summary",
    "locale",
    "published_at",
)
PUBLIC_STATUSES = {"member", "cert_pending", "certified", "delivery"}
SERVICE_MODES = {"remote", "onsite", "hybrid"}
AVAILABILITY = {"available", "limited", "unavailable"}
ALL_STATUSES = PUBLIC_STATUSES | {"inactive"}
LOCALES = {"zh-CN", "en"}
FILTER_FIELDS = {"status", "tag", "city", "availability"}
_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class ValidationError(ValueError):
    pass


def save_profile(
    conn: sqlite3.Connection,
    payload: dict,
    actor: str,
    now: datetime,
) -> dict:
    clean = _validate_profile(payload)
    audit_actor = _text(actor, "actor", 120)
    stamp = _iso(now)
    owns_transaction = not conn.in_transaction
    if owns_transaction:
        conn.execute("BEGIN IMMEDIATE")
    try:
        current = conn.execute(
            "SELECT id, status FROM talent_profiles WHERE slug = ?",
            (clean["slug"],),
        ).fetchone()
        values = tuple(clean[field] for field in (
            "display_name", "real_name", "headline", "city", "service_mode",
            "availability", "status", "summary", "not_fit", "service_package",
            "evidence_summary",
        ))
        if current is None:
            cursor = conn.execute(
                """
                INSERT INTO talent_profiles(
                    slug, display_name, real_name, headline, city, service_mode,
                    availability, status, summary, not_fit, service_package,
                    evidence_summary, public_authorized, locale, published_at,
                    created_at, updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)
                """,
                (
                    clean["slug"], *values, int(clean["public_authorized"]),
                    clean["locale"], stamp, stamp,
                ),
            )
            profile_id = int(cursor.lastrowid)
            action = "talent_profile.created"
            before = None
        else:
            profile_id = int(current["id"])
            conn.execute(
                """
                UPDATE talent_profiles SET
                    display_name=?, real_name=?, headline=?, city=?, service_mode=?,
                    availability=?, status=?, summary=?, not_fit=?, service_package=?,
                    evidence_summary=?, public_authorized=?, locale=?, published_at=NULL,
                    updated_at=?
                WHERE id=?
                """,
                (*values, int(clean["public_authorized"]), clean["locale"], stamp, profile_id),
            )
            action = "talent_profile.updated"
            before = {"status": current["status"]}
        conn.execute("DELETE FROM talent_tags WHERE profile_id = ?", (profile_id,))
        conn.executemany(
            "INSERT INTO talent_tags(profile_id, tag) VALUES(?, ?)",
            [(profile_id, tag) for tag in clean["tags"]],
        )
        append_audit(
            conn,
            action=action,
            actor=audit_actor,
            object_type="talent_profile",
            object_id=clean["slug"],
            before=before,
            after={"status": clean["status"], "public_authorized": clean["public_authorized"]},
            now=now,
        )
        if owns_transaction:
            conn.commit()
    except Exception:
        if owns_transaction:
            conn.rollback()
        raise
    return _internal_profile(conn, profile_id)


def publish_profile(
    conn: sqlite3.Connection,
    profile_id: int,
    actor: str,
    now: datetime,
) -> dict:
    audit_actor = _text(actor, "actor", 120)
    owns_transaction = not conn.in_transaction
    if owns_transaction:
        conn.execute("BEGIN IMMEDIATE")
    try:
        current = conn.execute(
            "SELECT * FROM talent_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if current is None:
            raise ValidationError("talent profile not found")
        if not current["public_authorized"]:
            raise ValidationError("public authorization is required")
        if not current["evidence_summary"].strip():
            raise ValidationError("evidence summary is required")
        if current["status"] not in PUBLIC_STATUSES:
            raise ValidationError("profile status cannot be published")
        stamp = _iso(now)
        conn.execute(
            "UPDATE talent_profiles SET published_at=?, updated_at=? WHERE id=?",
            (stamp, stamp, profile_id),
        )
        append_audit(
            conn,
            action="talent_profile.published",
            actor=audit_actor,
            object_type="talent_profile",
            object_id=current["slug"],
            before={"published": bool(current["published_at"])},
            after={"published": True, "status": current["status"]},
            now=now,
        )
        if owns_transaction:
            conn.commit()
    except Exception:
        if owns_transaction:
            conn.rollback()
        raise
    return _internal_profile(conn, profile_id)


def normalize_filters(filters: dict) -> dict:
    if not isinstance(filters, dict) or set(filters) - FILTER_FIELDS:
        raise ValidationError("unknown talent filter")
    clean = {key: "" for key in ("status", "tag", "city", "availability")}
    for key, value in filters.items():
        clean[key] = _optional_text(value, key, 80) or ""
    if clean["status"] and clean["status"] not in PUBLIC_STATUSES:
        raise ValidationError("invalid status filter")
    if clean["availability"] and clean["availability"] not in AVAILABILITY:
        raise ValidationError("invalid availability filter")
    return clean


def list_public_profiles(conn: sqlite3.Connection, filters: dict) -> list[dict]:
    clean = normalize_filters(filters)
    conditions = ["profile.published_at IS NOT NULL", "profile.public_authorized = 1"]
    values: list[str] = []
    for field in ("status", "city", "availability"):
        if clean[field]:
            conditions.append(f"profile.{field} = ?")
            values.append(clean[field])
    if clean["tag"]:
        conditions.append(
            "EXISTS (SELECT 1 FROM talent_tags AS wanted WHERE wanted.profile_id=profile.id AND wanted.tag=?)"
        )
        values.append(clean["tag"])
    rows = conn.execute(
        f"""
        SELECT profile.*
        FROM talent_profiles AS profile
        WHERE {' AND '.join(conditions)}
        ORDER BY
            CASE profile.status
                WHEN 'delivery' THEN 0 WHEN 'certified' THEN 1
                WHEN 'cert_pending' THEN 2 ELSE 3
            END,
            CASE WHEN profile.evidence_summary != '' THEN 0 ELSE 1 END,
            profile.published_at DESC,
            profile.id ASC
        """,
        values,
    ).fetchall()
    return [_public_profile(conn, row) for row in rows]


def get_public_profile(conn: sqlite3.Connection, slug: str) -> dict | None:
    normalized = _text(slug, "slug", 100)
    row = conn.execute(
        """
        SELECT * FROM talent_profiles
        WHERE slug=? AND published_at IS NOT NULL AND public_authorized=1
        """,
        (normalized,),
    ).fetchone()
    return _public_profile(conn, row) if row is not None else None


def _public_profile(conn, row) -> dict:
    result = {field: row[field] for field in PUBLIC_FIELDS}
    result["tags"] = [
        item[0]
        for item in conn.execute(
            "SELECT tag FROM talent_tags WHERE profile_id=? ORDER BY tag",
            (row["id"],),
        )
    ]
    result["certification_label"] = (
        "尚未完成 OneX 认证"
        if row["status"] in {"member", "cert_pending"}
        else "OneX 认证 FDE"
    )
    return result


def _internal_profile(conn, profile_id: int) -> dict:
    row = conn.execute("SELECT * FROM talent_profiles WHERE id=?", (profile_id,)).fetchone()
    if row is None:
        raise ValidationError("talent profile not found")
    result = dict(row)
    result["public_authorized"] = bool(result["public_authorized"])
    result["tags"] = [
        item[0]
        for item in conn.execute(
            "SELECT tag FROM talent_tags WHERE profile_id=? ORDER BY tag",
            (profile_id,),
        )
    ]
    return result


def _validate_profile(payload: dict) -> dict:
    if not isinstance(payload, dict) or set(payload) != PROFILE_FIELDS:
        raise ValidationError("profile fields do not match the contract")
    clean = {
        field: _text(payload[field], field, 2000 if field in {
            "summary", "not_fit", "service_package", "evidence_summary"
        } else 180)
        for field in PROFILE_FIELDS - {"tags", "public_authorized", "evidence_summary"}
    }
    evidence = payload["evidence_summary"]
    if not isinstance(evidence, str) or len(evidence.strip()) > 2000:
        raise ValidationError("invalid evidence_summary")
    clean["evidence_summary"] = evidence.strip()
    if not _SLUG.fullmatch(clean["slug"]) or len(clean["slug"]) > 100:
        raise ValidationError("invalid slug")
    if clean["service_mode"] not in SERVICE_MODES:
        raise ValidationError("invalid service mode")
    if clean["availability"] not in AVAILABILITY:
        raise ValidationError("invalid availability")
    if clean["status"] not in ALL_STATUSES:
        raise ValidationError("invalid status")
    if clean["locale"] not in LOCALES:
        raise ValidationError("invalid locale")
    if not isinstance(payload["public_authorized"], bool):
        raise ValidationError("public_authorized must be boolean")
    if not isinstance(payload["tags"], list) or not 1 <= len(payload["tags"]) <= 10:
        raise ValidationError("tags must contain 1 to 10 items")
    tags = sorted({_text(tag, "tag", 40) for tag in payload["tags"]})
    clean["tags"] = tags
    clean["public_authorized"] = payload["public_authorized"]
    return clean


def _text(value, field: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text")
    normalized = value.strip()
    if not normalized or len(normalized) > maximum:
        raise ValidationError(f"invalid {field}")
    return normalized


def _optional_text(value, field: str, maximum: int) -> str | None:
    if value in (None, ""):
        return None
    return _text(value, field, maximum)
