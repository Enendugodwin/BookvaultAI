from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, audit, get_current, require_csrf
from app.core.db import get_db
from app.core.errors import AppError, Forbidden, NotFound
from app.models.book import UserBook
from app.models.knowledge import Highlight, Note
from app.models.ops import BackgroundJob
from app.models.reading import ReadingSession
from app.models.user import AuditLog, User, UserSession
from app.schemas.admin import AdminUserUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(auth: AuthContext = Depends(get_current)) -> AuthContext:
    if not auth.user.is_admin:
        raise Forbidden("Administrator access is required.")
    return auth


def require_admin_csrf(auth: AuthContext = Depends(require_csrf)) -> AuthContext:
    if not auth.user.is_admin:
        raise Forbidden("Administrator access is required.")
    return auth


def _other_active_admins(db: Session, exclude_user_id: str) -> int:
    return int(db.scalar(
        select(func.count(User.id)).where(
            User.is_admin.is_(True),
            User.is_active.is_(True),
            User.id != exclude_user_id,
        )
    ) or 0)


def _counts_for(db: Session, ids: list[str]) -> tuple[dict, dict, dict]:
    if not ids:
        return {}, {}, {}
    books = dict(db.execute(
        select(UserBook.user_id, func.count(UserBook.id))
        .where(UserBook.user_id.in_(ids))
        .group_by(UserBook.user_id)
    ).all())
    sessions = {
        user_id: (int(count or 0), int(seconds or 0))
        for user_id, count, seconds in db.execute(
            select(
                ReadingSession.user_id,
                func.count(ReadingSession.id),
                func.coalesce(func.sum(ReadingSession.duration_seconds), 0),
            )
            .where(ReadingSession.user_id.in_(ids))
            .group_by(ReadingSession.user_id)
        ).all()
    }
    active = dict(db.execute(
        select(UserSession.user_id, func.count(UserSession.id))
        .where(UserSession.user_id.in_(ids), UserSession.revoked_at.is_(None))
        .group_by(UserSession.user_id)
    ).all())
    return books, sessions, active


def _user_row(user: User, books: dict, sessions: dict, active: dict) -> dict:
    count, seconds = sessions.get(user.id, (0, 0))
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "is_demo": user.is_demo,
        "email_verified": user.email_verified,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
        "book_count": int(books.get(user.id, 0) or 0),
        "session_count": count,
        "reading_minutes": seconds // 60,
        "active_sessions": int(active.get(user.id, 0) or 0),
    }


@router.get("/overview")
def overview(auth: AuthContext = Depends(require_admin), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=7)
    total_users = int(db.scalar(select(func.count(User.id))) or 0)
    active_users = int(db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0)
    admins = int(db.scalar(select(func.count(User.id)).where(
        User.is_admin.is_(True), User.is_active.is_(True)
    )) or 0)
    verified = int(db.scalar(select(func.count(User.id)).where(User.email_verified.is_(True))) or 0)
    new_users = int(db.scalar(select(func.count(User.id)).where(User.created_at >= since)) or 0)
    active_recently = int(db.scalar(select(func.count(User.id)).where(User.last_login_at >= since)) or 0)
    books = int(db.scalar(select(func.count(UserBook.id))) or 0)
    sessions = int(db.scalar(select(func.count(ReadingSession.id))) or 0)
    minutes = int((db.scalar(select(func.coalesce(func.sum(ReadingSession.duration_seconds), 0))) or 0) // 60)
    notes = int(db.scalar(select(func.count(Note.id))) or 0)
    highlights = int(db.scalar(select(func.count(Highlight.id))) or 0)
    job_rows = db.execute(
        select(BackgroundJob.status, func.count(BackgroundJob.id)).group_by(BackgroundJob.status)
    ).all()
    jobs = {status: int(count or 0) for status, count in job_rows}
    failed_recent = int(db.scalar(
        select(func.count(BackgroundJob.id)).where(
            BackgroundJob.status == "failed",
            BackgroundJob.finished_at >= now - timedelta(hours=24),
        )
    ) or 0)
    recent = db.scalars(select(User).order_by(User.created_at.desc()).limit(5)).all()
    recent_ids = [u.id for u in recent]
    book_counts, session_counts, active_sessions = _counts_for(db, recent_ids)
    return {
        "generated_at": now,
        "totals": {
            "users": total_users,
            "active_users": active_users,
            "suspended_users": total_users - active_users,
            "admins": admins,
            "verified_users": verified,
            "new_users_7d": new_users,
            "active_users_7d": active_recently,
            "books": books,
            "sessions": sessions,
            "reading_minutes": minutes,
            "notes": notes,
            "highlights": highlights,
        },
        "jobs": {**jobs, "failed_last_24h": failed_recent},
        "recent_users": [_user_row(u, book_counts, session_counts, active_sessions) for u in recent],
    }


@router.get("/users")
def list_users(
    auth: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
    q: str = Query(default="", max_length=120),
    status: Literal["all", "active", "disabled"] = "all",
    role: Literal["all", "admin", "user"] = "all",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    query = select(User)
    term = q.strip()
    if term:
        like = f"%{term}%"
        query = query.where(or_(User.email.ilike(like), User.display_name.ilike(like)))
    if status == "active":
        query = query.where(User.is_active.is_(True))
    elif status == "disabled":
        query = query.where(User.is_active.is_(False))
    if role == "admin":
        query = query.where(User.is_admin.is_(True))
    elif role == "user":
        query = query.where(User.is_admin.is_(False))
    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = db.scalars(
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    book_counts, session_counts, active_sessions = _counts_for(db, [u.id for u in rows])
    return {
        "items": [_user_row(u, book_counts, session_counts, active_sessions) for u in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/activity")
def activity(
    auth: AuthContext = Depends(require_admin),
    db: Session = Depends(get_db),
    limit: int = Query(default=30, ge=1, le=100),
):
    rows = db.execute(
        select(AuditLog, User.email)
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()
    return {
        "items": [
            {
                "id": log.id,
                "action": log.action,
                "detail": log.detail or {},
                "created_at": log.created_at,
                "user_id": log.user_id,
                "email": email,
            }
            for log, email in rows
        ]
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    auth: AuthContext = Depends(require_admin_csrf),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise NotFound("User")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise AppError("no_changes", "No account changes were provided.", 400)
    if target.id == auth.user.id:
        if changes.get("is_active") is False:
            raise AppError("self_lockout", "You cannot suspend your own administrator account.", 400)
        if changes.get("is_admin") is False:
            raise AppError("self_demote", "You cannot remove your own administrator access.", 400)
    demoting = target.is_admin and changes.get("is_admin") is False
    suspending = target.is_active and changes.get("is_active") is False
    if (demoting or suspending) and _other_active_admins(db, target.id) == 0:
        raise AppError(
            "last_admin",
            "At least one active administrator must remain.",
            409,
        )
    for field, value in changes.items():
        if value is not None:
            setattr(target, field, value)
    audit(db, auth.user.id, "admin.user_updated", {"target_user_id": target.id, "changes": changes})
    db.commit()
    book_counts, session_counts, active_sessions = _counts_for(db, [target.id])
    return {"user": _user_row(target, book_counts, session_counts, active_sessions)}


@router.post("/users/{user_id}/revoke-sessions")
def revoke_sessions(
    user_id: str,
    auth: AuthContext = Depends(require_admin_csrf),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise NotFound("User")
    if target.id == auth.user.id:
        raise AppError("self_revoke", "Use your account security settings to sign out your own sessions.", 400)
    count = db.query(UserSession).filter(
        UserSession.user_id == target.id,
        UserSession.revoked_at.is_(None),
    ).update({"revoked_at": datetime.now(timezone.utc)}, synchronize_session=False)
    audit(db, auth.user.id, "admin.sessions_revoked", {"target_user_id": target.id, "count": count})
    db.commit()
    return {"message": f"Signed out {count} session(s).", "revoked": count}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    auth: AuthContext = Depends(require_admin_csrf),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise NotFound("User")
    if target.id == auth.user.id:
        raise AppError("self_delete", "Use account settings to delete your own account.", 400)
    if target.is_admin and target.is_active and _other_active_admins(db, target.id) == 0:
        raise AppError("last_admin", "At least one active administrator must remain.", 409)
    email = target.email
    audit(db, auth.user.id, "admin.user_deleted", {"target_user_id": target.id, "email": email})
    db.delete(target)
    db.commit()
    return {"message": f"Deleted {email} and their personal data."}
