"""Auditable feature-flag management for the FDE talent network."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from .db import DEFAULT_FLAGS, connect, initialize, public_config, set_feature_flag


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OneX FDE 人才网络灰度管理")
    parser.add_argument(
        "--db",
        default=os.environ.get("FDE_NETWORK_DB", "/var/lib/fde-network/network.db"),
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("show-config")
    flag = commands.add_parser("set-flag")
    flag.add_argument("key", choices=tuple(DEFAULT_FLAGS))
    flag.add_argument("enabled", choices=("true", "false"))
    flag.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    conn = connect(args.db)
    try:
        now = datetime.now(timezone.utc)
        initialize(conn, now)
        if args.command == "show-config":
            result = public_config(conn)
        else:
            result = set_feature_flag(
                conn,
                args.key,
                args.enabled == "true",
                args.actor,
                now,
            )
    finally:
        conn.close()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
