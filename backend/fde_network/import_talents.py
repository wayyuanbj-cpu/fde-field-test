"""Validated, transactional first-batch talent import workflow."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from .db import connect, initialize
from .talents import (
    PROFILE_FIELDS,
    ValidationError,
    _validate_profile,
    publish_profile,
    save_profile,
)


PRIVATE_OR_UNAPPROVED_FIELDS = {
    "phone",
    "mobile",
    "email",
    "wechat",
    "id_number",
    "client_raw_name",
    "contract_body",
    "unredacted_url",
    "private_path",
}


def validate_record(record: dict) -> dict:
    if not isinstance(record, dict):
        raise ValidationError("talent record must be an object")
    forbidden = set(record) & PRIVATE_OR_UNAPPROVED_FIELDS
    if forbidden:
        raise ValidationError(f"private fields are forbidden: {sorted(forbidden)[0]}")
    unknown = set(record) - PROFILE_FIELDS
    if unknown:
        raise ValidationError(f"unknown talent field: {sorted(unknown)[0]}")
    clean = _validate_profile(record)
    if not clean["public_authorized"]:
        raise ValidationError("first-batch public authorization is required")
    return clean


def import_records(
    conn,
    records: list[dict],
    actor: str,
    now: datetime,
    *,
    publish: bool = False,
    dry_run: bool = False,
) -> dict:
    if not isinstance(records, list) or not records:
        raise ValidationError("input must contain at least one talent record")
    clean_records = [validate_record(record) for record in records]
    slugs = [record["slug"] for record in clean_records]
    if len(slugs) != len(set(slugs)):
        raise ValidationError("input contains duplicate slugs")
    existing = {
        row[0]
        for row in conn.execute(
            f"SELECT slug FROM talent_profiles WHERE slug IN ({','.join('?' for _ in slugs)})",
            slugs,
        )
    }
    result = {
        "created": sum(slug not in existing for slug in slugs),
        "updated": sum(slug in existing for slug in slugs),
    }
    if dry_run:
        return result

    conn.execute("BEGIN IMMEDIATE")
    try:
        for record in clean_records:
            profile = save_profile(conn, record, actor, now)
            if publish:
                publish_profile(conn, profile["id"], actor, now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="安全导入 OneX FDE 首批人才档案")
    parser.add_argument(
        "--db",
        default=os.environ.get("FDE_NETWORK_DB", "/var/lib/fde-network/network.db"),
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args(argv)
    if args.dry_run and args.publish:
        parser.error("--dry-run and --publish cannot be combined")
    records = json.loads(Path(args.input).read_text(encoding="utf-8"))
    conn = connect(args.db)
    try:
        initialize(conn)
        result = import_records(
            conn,
            records,
            args.actor,
            datetime.now(timezone.utc),
            publish=args.publish,
            dry_run=args.dry_run,
        )
    finally:
        conn.close()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
