from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ops import Notification
from app.models.user import User


def create_notification(
    db: Session, user: User, category: str, title: str, body: str,
    dedupe_key: str, *, email_requested: bool = False,
) -> Notification | None:
    existing = db.scalar(
        select(Notification).where(
            Notification.user_id == user.id, Notification.dedupe_key == dedupe_key
        )
    )
    if existing:
        return None
    status = "pending" if email_requested else "not_requested"
    note = Notification(
        user_id=user.id, category=category, title=title, body=body,
        dedupe_key=dedupe_key, email_status=status,
        created_at=datetime.now(timezone.utc),
    )
    db.add(note)
    db.flush()
    return note
