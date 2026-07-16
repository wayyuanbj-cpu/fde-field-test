import argparse
import json
import os
import secrets
import string

from .auth import create_user, reset_password, unlock_user
from .db import connect, initialize


def generate_password():
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(20))


def write_credentials(path, username, password):
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump({"username": username, "one_time_password": password}, handle, ensure_ascii=False)
        handle.write("\n")
    os.chmod(path, 0o600)


def user_by_name(conn, username):
    return conn.execute("SELECT id,username FROM users WHERE username=?", (username,)).fetchone()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Manage the private FDE analytics service")
    parser.add_argument("command", choices=("bootstrap", "reset-password", "unlock"))
    parser.add_argument("--db", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--credentials")
    args = parser.parse_args(argv)
    conn = connect(args.db)
    initialize(conn)
    try:
        if args.command == "bootstrap":
            owner_count = conn.execute("SELECT COUNT(*) FROM users WHERE role='owner'").fetchone()[0]
            if owner_count:
                return 0
            password = generate_password()
            create_user(conn, args.username, password, "owner", True)
            if not args.credentials:
                parser.error("--credentials is required for bootstrap")
            write_credentials(args.credentials, args.username, password)
        elif args.command == "reset-password":
            row = user_by_name(conn, args.username)
            if not row:
                parser.error("user not found")
            password = generate_password()
            reset_password(conn, row["id"], row["id"], password)
            if not args.credentials:
                parser.error("--credentials is required for reset-password")
            write_credentials(args.credentials, args.username, password)
        else:
            row = user_by_name(conn, args.username)
            if not row:
                parser.error("user not found")
            unlock_user(conn, row["id"], row["id"])
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
