"""Grant or revoke administrator access without exposing an HTTP endpoint.

Usage (from backend/):
    python scripts/admin.py list
    python scripts/admin.py promote owner@example.com
    python scripts/admin.py revoke owner@example.com
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

import app.models  # noqa: F401
from app.core.db import SessionLocal
from app.models.user import User


def _find(db, email: str) -> User:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if not user:
        raise SystemExit(f"No account exists for {email}. Register it first, then run this command.")
    return user


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage YVO's Book Vault administrators.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="List administrator accounts.")
    promote = sub.add_parser("promote", help="Grant administrator access.")
    promote.add_argument("email")
    revoke = sub.add_parser("revoke", help="Remove administrator access.")
    revoke.add_argument("email")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.command == "list":
            users = db.scalars(select(User).where(User.is_admin.is_(True)).order_by(User.email)).all()
            if not users:
                print("No administrators configured.")
            for user in users:
                state = "active" if user.is_active else "suspended"
                print(f"{user.email}  {user.display_name}  {state}")
            return 0
        user = _find(db, args.email)
        if args.command == "revoke":
            remaining = db.scalar(
                select(User).where(
                    User.is_admin.is_(True), User.is_active.is_(True), User.id != user.id
                ).limit(1)
            )
            if not remaining:
                print("Refusing to remove the last active administrator.", file=sys.stderr)
                return 1
        user.is_admin = args.command == "promote"
        db.commit()
        print(f"{user.email} is {'now an administrator' if user.is_admin else 'no longer an administrator'}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
