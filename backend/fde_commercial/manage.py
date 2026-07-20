"""Auditable command-line operations for the FDE commercial service."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from .db import append_audit, connect, initialize
from .operations import (
    assign_application,
    create_cohort,
    enroll_application,
    transition_application,
)


DEFAULT_DB_PATH = "/var/lib/fde-commercial/commercial.db"
APPLICATION_STATUSES = (
    "submitted",
    "reviewing",
    "contacted",
    "qualified",
    "waitlisted",
    "admitted",
    "enrolled",
    "rejected",
    "withdrawn",
    "closed",
)
APPLICATION_SOURCES = (
    "public_test",
    "wechat_article",
    "community",
    "talent_page",
    "referral",
    "direct",
    "other",
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m fde_commercial.manage",
        description="FDE 培训招生运营工具",
    )
    parser.add_argument(
        "--db",
        default=os.environ.get("FDE_COMMERCIAL_DB", DEFAULT_DB_PATH),
        help="商业化 SQLite 数据库路径",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    listing = subparsers.add_parser("list-applications", help="列出招生申请")
    listing.add_argument("--status", choices=APPLICATION_STATUSES)
    listing.add_argument("--source", choices=APPLICATION_SOURCES)
    listing.add_argument("--limit", type=_positive_limit, default=100)
    listing.add_argument("--show-private", action="store_true")
    listing.add_argument("--actor", help="查看隐私字段时必填")

    assign = subparsers.add_parser("assign", help="分配招生运营人员")
    assign.add_argument("application_id", type=int)
    assign.add_argument("--operator-id", required=True)
    _require_actor(assign)

    transition = subparsers.add_parser("transition", help="更新申请状态")
    transition.add_argument("application_id", type=int)
    transition.add_argument("--status", choices=APPLICATION_STATUSES, required=True)
    transition.add_argument("--reason")
    _require_actor(transition)

    create = subparsers.add_parser("create-cohort", help="创建小班班期")
    create.add_argument("--name", required=True)
    create.add_argument("--capacity", type=int, default=10)
    create.add_argument("--starts-at")
    create.add_argument("--ends-at")
    _require_actor(create)

    enroll = subparsers.add_parser("enroll", help="将已录取申请加入班期")
    enroll.add_argument("application_id", type=int)
    enroll.add_argument("--cohort-id", type=int, required=True)
    _require_actor(enroll)

    cohorts = subparsers.add_parser("list-cohorts", help="列出班期")
    cohorts.add_argument("--status")
    cohorts.add_argument("--limit", type=_positive_limit, default=100)

    audit = subparsers.add_parser("show-audit", help="查看追加式审计记录")
    audit.add_argument("--action")
    audit.add_argument("--limit", type=_positive_limit, default=100)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if (
        args.command == "list-applications"
        and args.show_private
        and (not args.actor or not args.actor.strip())
    ):
        parser.error("list-applications --show-private requires --actor")

    now = datetime.now(timezone.utc)
    conn = connect(args.db)
    try:
        initialize(conn, now)
        result = _execute(conn, args, now)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    finally:
        conn.close()
    return 0


def _execute(conn, args, now: datetime):
    if args.command == "list-applications":
        return _list_applications(conn, args, now)
    if args.command == "assign":
        return assign_application(
            conn,
            args.application_id,
            args.operator_id,
            args.actor,
            now,
        )
    if args.command == "transition":
        return transition_application(
            conn,
            args.application_id,
            args.status,
            args.reason,
            args.actor,
            now,
        )
    if args.command == "create-cohort":
        return create_cohort(
            conn,
            {
                "name": args.name,
                "capacity": args.capacity,
                "starts_at": args.starts_at,
                "ends_at": args.ends_at,
            },
            args.actor,
            now,
        )
    if args.command == "enroll":
        return enroll_application(
            conn,
            args.application_id,
            args.cohort_id,
            args.actor,
            now,
        )
    if args.command == "list-cohorts":
        return _list_cohorts(conn, args)
    if args.command == "show-audit":
        return _show_audit(conn, args)
    raise RuntimeError(f"unsupported command: {args.command}")


def _list_applications(conn, args, now: datetime) -> list[dict]:
    conditions = []
    values: list[object] = []
    if args.status:
        conditions.append("status = ?")
        values.append(args.status)
    if args.source:
        conditions.append("source = ?")
        values.append(args.source)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(
        f"""
        SELECT id, public_id, name, mobile, wechat, current_role, source, status,
               status_reason, assigned_operator_id, created_at, updated_at
        FROM training_applications
        {where}
        ORDER BY id DESC
        LIMIT ?
        """,
        (*values, args.limit),
    ).fetchall()
    if args.show_private:
        with conn:
            append_audit(
                conn,
                actor=args.actor.strip(),
                action="training_application.private_list_viewed",
                object_type="training_application",
                object_id="list",
                before=None,
                after={
                    "status_filter": args.status,
                    "source_filter": args.source,
                    "row_count": len(rows),
                },
                now=now,
            )
        return [dict(row) for row in rows]

    return [
        {
            **dict(row),
            "name": _mask_name(row["name"]),
            "mobile": _mask_mobile(row["mobile"]),
            "wechat": None,
        }
        for row in rows
    ]


def _list_cohorts(conn, args) -> list[dict]:
    if args.status:
        rows = conn.execute(
            """
            SELECT * FROM training_cohorts
            WHERE status = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (args.status, args.limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM training_cohorts ORDER BY id DESC LIMIT ?",
            (args.limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def _show_audit(conn, args) -> list[dict]:
    if args.action:
        rows = conn.execute(
            """
            SELECT * FROM commercial_audit_events
            WHERE action = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (args.action, args.limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM commercial_audit_events ORDER BY id DESC LIMIT ?",
            (args.limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def _mask_mobile(value: str) -> str:
    if len(value) < 7:
        return "***"
    return f"{value[:3]}****{value[-4:]}"


def _mask_name(value: str) -> str:
    if len(value) <= 1:
        return "*"
    return f"{value[0]}{'*' * min(2, len(value) - 1)}"


def _positive_limit(value: str) -> int:
    parsed = int(value)
    if parsed < 1 or parsed > 1000:
        raise argparse.ArgumentTypeError("limit must be between 1 and 1000")
    return parsed


def _require_actor(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--actor", required=True, help="操作人审计标识")


if __name__ == "__main__":
    sys.exit(main())
