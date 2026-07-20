"""Public product projection and FDE training application workflows."""

from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
import string
from datetime import datetime

from .db import append_audit, enqueue_outbox


PRODUCT_CODE = "FDE-TRAINING-SMALL-CLASS"
OFFER_CODE = "fde-small-class-open-application"
CONSENT_VERSION = "training-application-v1"

_ALLOWED_FIELDS = {
    "product_code",
    "offer_id",
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
    "_company",
}
_REQUIRED_FIELDS = _ALLOWED_FIELDS - {"wechat", "_company"}
_SHORT_FIELDS = ("name", "wechat", "current_role")
_NARRATIVE_FIELDS = ("fde_experience", "learning_goal", "time_commitment")
_AI_EXPERIENCE = {"beginner", "practitioner", "delivery"}
_SOURCES = {
    "public_test",
    "wechat_article",
    "community",
    "talent_page",
    "referral",
    "direct",
    "other",
}
_PUBLIC_ID_ALPHABET = string.ascii_uppercase + string.digits


class ValidationError(ValueError):
    pass


class OfferUnavailableError(RuntimeError):
    def __init__(self, status: str):
        super().__init__(status)
        self.status = status


class ExistingApplicationError(RuntimeError):
    pass


def public_product(conn: sqlite3.Connection, code: str) -> dict | None:
    """Return only the fields approved for the public training page."""

    row = conn.execute(
        """
        SELECT
            product.code,
            product.name,
            product.capacity_per_cohort,
            product.public_path,
            product.status AS product_status,
            offer.status AS offer_status,
            offer.application_open,
            offer.price_display
        FROM commercial_products AS product
        LEFT JOIN commercial_offers AS offer
          ON offer.product_id = product.id
        WHERE product.code = ?
        ORDER BY
            CASE offer.status
                WHEN 'open' THEN 0
                WHEN 'waitlist_only' THEN 1
                WHEN 'paused' THEN 2
                ELSE 3
            END,
            offer.id
        LIMIT 1
        """,
        (code,),
    ).fetchone()
    if row is None:
        return None
    return {
        "code": row["code"],
        "name": row["name"],
        "capacity_per_cohort": row["capacity_per_cohort"],
        "application_status": _application_status(row),
        "price_display": row["price_display"],
        "public_path": row["public_path"],
    }


def create_application(
    conn: sqlite3.Connection,
    payload: dict,
    idempotency_key: str,
    now: datetime,
) -> dict:
    """Validate and persist one private FDE small-class application."""

    clean = _validate_payload(payload)
    idem_hash = _idempotency_hash(idempotency_key)
    try:
        with conn:
            prior = conn.execute(
                """
                SELECT public_id, status
                FROM training_applications
                WHERE idempotency_hash = ?
                """,
                (idem_hash,),
            ).fetchone()
            if prior is not None:
                return _public_application_result(
                    prior["public_id"], prior["status"], True
                )

            product, offer = _load_sellable_offer(
                conn, clean["product_code"], clean["offer_id"]
            )
            application_status = _application_status_from_values(
                product["status"], offer["status"], offer["application_open"]
            )
            if application_status not in {"open", "waitlist_only"}:
                raise OfferUnavailableError(application_status)
            if find_active_application_by_mobile(
                conn, product["id"], clean["mobile"], normalize=False
            ):
                raise ExistingApplicationError("existing_application")

            public_id = _new_public_id()
            status = "waitlisted" if application_status == "waitlist_only" else "submitted"
            stamp = _iso(now)
            conn.execute(
                """
                INSERT INTO training_applications(
                    public_id, product_id, offer_id, name, mobile, wechat,
                    current_role, ai_experience, fde_experience, learning_goal,
                    time_commitment, source, source_detail, consent_version, status,
                    assigned_operator_id, mobile_verification_status, idempotency_hash,
                    created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL,
                    'pending', ?, ?, ?
                )
                """,
                (
                    public_id,
                    product["id"],
                    offer["id"],
                    clean["name"],
                    clean["mobile"],
                    clean["wechat"] or None,
                    clean["current_role"],
                    clean["ai_experience"],
                    clean["fde_experience"],
                    clean["learning_goal"],
                    clean["time_commitment"],
                    clean["source"],
                    clean["consent_version"],
                    status,
                    idem_hash,
                    stamp,
                    stamp,
                ),
            )
            append_audit(
                conn,
                actor="public",
                action="training_application.created",
                object_type="training_application",
                object_id=public_id,
                before=None,
                after={"status": status, "source": clean["source"]},
                now=now,
            )
            enqueue_outbox(
                conn,
                topic="commercial.training_application.created",
                object_type="training_application",
                object_id=public_id,
                payload={"public_id": public_id},
                now=now,
            )
        return _public_application_result(public_id, status, False)
    except sqlite3.IntegrityError as exc:
        prior = conn.execute(
            "SELECT public_id, status FROM training_applications WHERE idempotency_hash = ?",
            (idem_hash,),
        ).fetchone()
        if prior is not None:
            return _public_application_result(prior["public_id"], prior["status"], True)
        product = conn.execute(
            "SELECT id FROM commercial_products WHERE code = ?",
            (clean["product_code"],),
        ).fetchone()
        if product and find_active_application_by_mobile(
            conn, product["id"], clean["mobile"], normalize=False
        ):
            raise ExistingApplicationError("existing_application") from exc
        raise


def find_active_application_by_mobile(
    conn: sqlite3.Connection,
    product_id: int,
    mobile: str,
    *,
    normalize: bool = True,
) -> dict | None:
    """Find one nonterminal application without exposing it publicly."""

    normalized = _normalize_mobile(mobile) if normalize else mobile
    row = conn.execute(
        """
        SELECT *
        FROM training_applications
        WHERE product_id = ?
          AND mobile = ?
          AND status NOT IN ('rejected', 'withdrawn', 'closed')
        ORDER BY id DESC
        LIMIT 1
        """,
        (product_id, normalized),
    ).fetchone()
    return dict(row) if row is not None else None


def _validate_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValidationError("申请内容必须是对象")
    unknown = set(payload) - _ALLOWED_FIELDS
    if unknown:
        raise ValidationError("申请包含未允许的字段")
    missing = _REQUIRED_FIELDS - set(payload)
    if missing:
        raise ValidationError("请填写完整的申请信息")
    if payload.get("_company") not in (None, ""):
        raise ValidationError("申请未通过校验")

    clean = {}
    for key in _REQUIRED_FIELDS | {"wechat"}:
        value = payload.get(key, "")
        if not isinstance(value, str):
            raise ValidationError(f"{key} 必须是文本")
        clean[key] = value.strip()
    if any(not clean[key] for key in _REQUIRED_FIELDS):
        raise ValidationError("请填写完整的申请信息")
    for key in _SHORT_FIELDS:
        if len(clean[key]) > 120:
            raise ValidationError(f"{key} 内容过长")
    for key in _NARRATIVE_FIELDS:
        if len(clean[key]) > 2000:
            raise ValidationError(f"{key} 内容过长")
    if clean["product_code"] != PRODUCT_CODE:
        raise ValidationError("未知培训产品")
    if clean["offer_id"] != OFFER_CODE:
        raise ValidationError("未知招生方案")
    if clean["ai_experience"] not in _AI_EXPERIENCE:
        raise ValidationError("AI 经验选项无效")
    if clean["source"] not in _SOURCES:
        raise ValidationError("来源选项无效")
    if clean["consent_version"] != CONSENT_VERSION:
        raise ValidationError("请确认当前隐私说明")
    clean["mobile"] = _normalize_mobile(clean["mobile"])
    return clean


def _normalize_mobile(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 13 and digits.startswith("86"):
        digits = digits[2:]
    if not re.fullmatch(r"1\d{10}", digits):
        raise ValidationError("请输入有效的中国大陆手机号")
    return digits


def _idempotency_hash(value: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise ValidationError("缺少有效的幂等键")
    return hashlib.sha256(value.strip().encode("utf-8")).hexdigest()


def _load_sellable_offer(conn: sqlite3.Connection, product_code: str, offer_code: str):
    row = conn.execute(
        """
        SELECT
            product.id AS product_id,
            product.status AS product_status,
            offer.id AS offer_id,
            offer.status AS offer_status,
            offer.application_open
        FROM commercial_products AS product
        JOIN commercial_offers AS offer ON offer.product_id = product.id
        WHERE product.code = ? AND offer.code = ?
        """,
        (product_code, offer_code),
    ).fetchone()
    if row is None:
        raise ValidationError("培训产品或招生方案不存在")
    product = {"id": row["product_id"], "status": row["product_status"]}
    offer = {
        "id": row["offer_id"],
        "status": row["offer_status"],
        "application_open": row["application_open"],
    }
    return product, offer


def _new_public_id() -> str:
    suffix = "".join(secrets.choice(_PUBLIC_ID_ALPHABET) for _ in range(10))
    return f"FDE-A-{suffix}"


def _public_application_result(public_id: str, status: str, idempotent: bool) -> dict:
    return {
        "public_id": public_id,
        "status": status,
        "message": "申请已提交，我们会在审核后与您联系。",
        "next_step": "请留意 OneX 招生运营的后续沟通。",
        "idempotent": idempotent,
    }


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _application_status(row: sqlite3.Row) -> str:
    return _application_status_from_values(
        row["product_status"], row["offer_status"], row["application_open"]
    )


def _application_status_from_values(product_status, offer_status, application_open) -> str:
    if product_status != "active" or offer_status is None:
        return "closed"
    if offer_status == "open" and application_open == 1:
        return "open"
    if offer_status == "waitlist_only" and application_open == 1:
        return "waitlist_only"
    if offer_status == "paused":
        return "paused"
    return "closed"
