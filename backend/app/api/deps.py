from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import Unauthorized
from app.core.security import hash_password, hash_token
from app.models.user import AuditLog, User, UserSession

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class AuthContext:
    user: User
    session: UserSession
    db: Session
    via_cookie: bool = True


def _session_from_request(db: Session, request: Request) -> tuple[UserSession, User, bool] | None:
    token = request.cookies.get(settings.cookie_name)
    via_cookie = bool(token)
    if not token:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
            via_cookie = False
    if not token:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if not session:
        return None
    now = datetime.now(timezone.utc)
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if session.revoked_at is not None or expires < now:
        return None
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        return None
    if session.last_seen_at is None or (
        now - (session.last_seen_at.replace(tzinfo=timezone.utc) if session.last_seen_at.tzinfo is None else session.last_seen_at)
    ) > timedelta(minutes=5):
        session.last_seen_at = now
        db.commit()
    return session, user, via_cookie


def get_current(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    found = _session_from_request(db, request)
    if not found:
        raise Unauthorized()
    session, user, via_cookie = found
    return AuthContext(user=user, session=session, db=db, via_cookie=via_cookie)


def require_csrf(request: Request, auth: AuthContext = Depends(get_current)) -> AuthContext:
    if request.method in SAFE_METHODS:
        return auth
    if not auth.via_cookie:
        return auth  # bearer clients are not vulnerable to browser CSRF
    token = request.headers.get("x-csrf-token") or ""
    if not token or not hmac.compare_digest(token, auth.session.csrf_token):
        raise Unauthorized("CSRF validation failed. Refresh the page and try again.")
    return auth


def create_session(db: Session, user: User, request: Request) -> tuple[str, UserSession]:
    from app.core.security import new_csrf_token, new_token

    raw = new_token()
    now = datetime.now(timezone.utc)
    ua = (request.headers.get("user-agent") or "")[:255] or None
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(raw),
        csrf_token=new_csrf_token(),
        user_agent=ua,
        ip_hash=hash_token(request.client.host if request.client else "unknown"),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(session)
    db.flush()
    return raw, session


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.cookie_name,
        path="/",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def audit(db: Session, user_id: str | None, action: str, detail: dict | None = None) -> None:
    db.add(AuditLog(
        user_id=user_id, action=action, detail=detail or {},
        created_at=datetime.now(timezone.utc),
    ))


def user_payload(user: User, csrf_token: str | None = None) -> dict:
    s = user.settings
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "email_verified": user.email_verified,
        "created_at": user.created_at,
        "csrf_token": csrf_token,
        "settings": {
            "timezone": s.timezone,
            "theme": s.theme,
            "preferred_genres": s.preferred_genres or [],
            "onboarded": s.onboarded,
            "reminder_time": s.reminder_time,
            "reminder_days": s.reminder_days or [],
            "notify_inapp": s.notify_inapp,
            "notify_email": s.notify_email,
            "weekly_summary": s.weekly_summary,
            "monthly_report": s.monthly_report,
            "ai_enabled": s.ai_enabled,
            "ai_external_consent": s.ai_external_consent,
            "page_size": s.page_size,
            "library_view": s.library_view,
        },
    }


def verify_own_book(db: Session, user_id: str, user_book_id: str):
    from app.core.errors import NotFound
    from app.models.book import UserBook

    ub = db.get(UserBook, user_book_id)
    if not ub or ub.user_id != user_id:
        raise NotFound("Book")
    return ub
