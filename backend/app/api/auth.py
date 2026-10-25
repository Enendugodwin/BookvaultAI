from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    AuthContext, audit, clear_session_cookie, create_session, get_current, require_csrf,
    set_session_cookie, user_payload,
)
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import AppError, Conflict, NotFound, Unauthorized
from app.core.logging import log_event
from app.core.ratelimit import check
from app.core.security import hash_password, hash_token, new_token, verify_password
from app.core.timeutils import valid_timezone
from app.models.reading import ReadingGoal
from app.models.user import (
    EmailVerificationToken, PasswordResetToken, User, UserSession, UserSettings,
)
from app.schemas.auth import (
    ChangePasswordIn, DeleteAccountIn, ForgotPasswordIn, LoginIn, OnboardingIn, ProfileIn,
    RegisterIn, ResetPasswordIn, SettingsIn, VerifyEmailIn,
)
from app.services.email import report_html, send_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _issue_token(db: Session, model, user_id: str, hours: int) -> str:
    raw = new_token()
    now = datetime.now(timezone.utc)
    db.add(model(
        user_id=user_id, token_hash=hash_token(raw), created_at=now,
        expires_at=now + timedelta(hours=hours),
    ))
    return raw


async def _send_verification(user: User, token: str) -> None:
    if not settings.email_enabled:
        return
    link = f"{settings.frontend_url}/verify-email?token={token}"
    html = report_html(
        "Verify your email",
        f"Hi {user.display_name}, confirm your email address to finish setting up YVO's Book Vault.",
        [("Verification link", link)],
        "If you did not create this account, you can ignore this message.",
    )
    result = await send_email(user.email, "Verify your YVO's Book Vault email", html)
    if result["status"] == "failed":
        log_event("verification_email_failed", level=30, user_id=user.id)


async def _send_reset(user: User, token: str) -> None:
    if not settings.email_enabled:
        return
    link = f"{settings.frontend_url}/reset-password?token={token}"
    html = report_html(
        "Reset your password",
        "Use the link below to choose a new password. It expires in 60 minutes and can only be used once.",
        [("Reset link", link)],
        "If you did not request a reset, no action is needed.",
    )
    result = await send_email(user.email, "Reset your YVO's Book Vault password", html)
    if result["status"] == "failed":
        log_event("reset_email_failed", level=30, user_id=user.id)


@router.post("/register", status_code=201)
async def register(payload: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    check(f"register:{_ip(request)}", 5, 3600)
    email = payload.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise Conflict("An account with this email already exists. Try signing in.")
    user = User(
        email=email, password_hash=hash_password(payload.password),
        display_name=payload.display_name, email_verified=False,
    )
    db.add(user)
    db.flush()
    db.add(UserSettings(user_id=user.id))
    db.flush()
    token = _issue_token(db, EmailVerificationToken, user.id, 48)
    raw_session, session = create_session(db, user, request)
    audit(db, user.id, "account.registered")
    db.commit()
    db.refresh(user)
    set_session_cookie(response, raw_session)
    await _send_verification(user, token)
    body = {"user": user_payload(user, session.csrf_token)}
    if settings.expose_reset_token and not settings.is_production:
        body["verification_token"] = token
    return body


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    check(f"login:{_ip(request)}", 15, 600)
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise Unauthorized("Incorrect email or password.")
    now = datetime.now(timezone.utc)
    user.last_login_at = now
    raw, session = create_session(db, user, request)
    audit(db, user.id, "account.login")
    db.commit()
    set_session_cookie(response, raw)
    return {"user": user_payload(user, session.csrf_token)}


@router.post("/logout")
def logout(response: Response, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    auth.session.revoked_at = datetime.now(timezone.utc)
    audit(db, auth.user.id, "account.logout")
    db.commit()
    clear_session_cookie(response)
    return {"message": "Signed out."}


@router.get("/me")
def me(auth: AuthContext = Depends(get_current)):
    return {"user": user_payload(auth.user, auth.session.csrf_token)}


@router.post("/password/forgot", status_code=202)
async def forgot_password(payload: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    check(f"forgot:{_ip(request)}", 5, 3600)
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    token = None
    if user and user.is_active:
        token = _issue_token(db, PasswordResetToken, user.id, 1)
        db.commit()
        await _send_reset(user, token)
    else:
        db.commit()
    body = {"message": "If that email is registered, a reset link has been sent."}
    if token and settings.expose_reset_token and not settings.is_production:
        body["reset_token"] = token
        body["reset_url"] = f"{settings.frontend_url}/reset-password?token={token}"
    return body


@router.post("/password/reset")
def reset_password(payload: ResetPasswordIn, request: Request, response: Response, db: Session = Depends(get_db)):
    check(f"reset:{_ip(request)}", 10, 3600)
    row = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(payload.token))
    )
    now = datetime.now(timezone.utc)
    if not row or row.used_at is not None:
        raise AppError("invalid_token", "This reset link is invalid or already used.", 400)
    expires = row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at
    if expires < now:
        raise AppError("expired_token", "This reset link has expired. Request a new one.", 400)
    user = db.get(User, row.user_id)
    if not user:
        raise AppError("invalid_token", "This reset link is invalid.", 400)
    user.password_hash = hash_password(payload.new_password)
    row.used_at = now
    db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
    ).update({"revoked_at": now})
    db.commit()
    clear_session_cookie(response)
    return {"message": "Password updated. Sign in with your new password."}


@router.post("/email/verify")
def verify_email(payload: VerifyEmailIn, db: Session = Depends(get_db)):
    row = db.scalar(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == hash_token(payload.token))
    )
    now = datetime.now(timezone.utc)
    if not row or row.used_at is not None:
        raise AppError("invalid_token", "This verification link is invalid or already used.", 400)
    expires = row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at
    if expires < now:
        raise AppError("expired_token", "This verification link has expired.", 400)
    user = db.get(User, row.user_id)
    if not user:
        raise NotFound("Account")
    user.email_verified = True
    row.used_at = now
    db.commit()
    return {"message": "Email verified."}


@router.post("/email/resend", status_code=202)
async def resend_verification(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    if auth.user.email_verified:
        return {"message": "Your email is already verified."}
    token = _issue_token(db, EmailVerificationToken, auth.user.id, 48)
    db.commit()
    await _send_verification(auth.user, token)
    body = {"message": "Verification email queued."}
    if settings.expose_reset_token and not settings.is_production:
        body["verification_token"] = token
    return body


@router.post("/password/change")
def change_password(
    payload: ChangePasswordIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if not verify_password(payload.current_password, auth.user.password_hash):
        raise AppError("invalid_password", "Your current password is incorrect.", 400)
    auth.user.password_hash = hash_password(payload.new_password)
    now = datetime.now(timezone.utc)
    db.query(UserSession).filter(
        UserSession.user_id == auth.user.id, UserSession.id != auth.session.id,
        UserSession.revoked_at.is_(None),
    ).update({"revoked_at": now})
    audit(db, auth.user.id, "account.password_changed")
    db.commit()
    return {"message": "Password changed. Other sessions were signed out."}


@router.patch("/profile")
def update_profile(
    payload: ProfileIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if payload.display_name is not None:
        auth.user.display_name = payload.display_name.strip()
    db.commit()
    return {"user": user_payload(auth.user, auth.session.csrf_token)}


@router.patch("/settings")
def update_settings(
    payload: SettingsIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    s = auth.user.settings
    data = payload.model_dump(exclude_unset=True)
    if "timezone" in data and data["timezone"]:
        data["timezone"] = valid_timezone(data["timezone"])
    for key, value in data.items():
        if value is not None:
            setattr(s, key, value)
    db.commit()
    return {"user": user_payload(auth.user, auth.session.csrf_token)}


@router.post("/onboarding")
def complete_onboarding(
    payload: OnboardingIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    s = auth.user.settings
    s.onboarded = True
    s.preferred_genres = [g.strip()[:80] for g in payload.genres if g.strip()][:30]
    if payload.reminder_time:
        s.reminder_time = payload.reminder_time
    s.notify_email = bool(payload.notify_email)
    s.ai_external_consent = bool(payload.ai_consent)
    if payload.annual_goal and payload.annual_goal > 0:
        year = date.today().year
        existing = db.scalar(
            select(ReadingGoal).where(
                ReadingGoal.user_id == auth.user.id,
                ReadingGoal.goal_type == "books",
                ReadingGoal.start_date == date(year, 1, 1),
            )
        )
        if not existing:
            db.add(ReadingGoal(
                user_id=auth.user.id, name=f"Read {payload.annual_goal} books in {year}",
                goal_type="books", period="year", target_value=payload.annual_goal,
                start_date=date(year, 1, 1), end_date=date(year, 12, 31),
            ))
    audit(db, auth.user.id, "account.onboarding_completed")
    db.commit()
    return {"user": user_payload(auth.user, auth.session.csrf_token)}


@router.get("/sessions")
def list_sessions(auth: AuthContext = Depends(get_current), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(UserSession).where(UserSession.user_id == auth.user.id)
        .order_by(UserSession.created_at.desc()).limit(50)
    ).all()
    now = datetime.now(timezone.utc)
    out = []
    for s in rows:
        expires = s.expires_at.replace(tzinfo=timezone.utc) if s.expires_at.tzinfo is None else s.expires_at
        out.append({
            "id": s.id, "created_at": s.created_at, "last_seen_at": s.last_seen_at,
            "expires_at": s.expires_at, "user_agent": s.user_agent,
            "revoked": s.revoked_at is not None, "expired": expires < now,
            "current": s.id == auth.session.id,
        })
    return {"items": out}


@router.post("/sessions/revoke-all")
def revoke_all_sessions(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    db.query(UserSession).filter(
        UserSession.user_id == auth.user.id, UserSession.revoked_at.is_(None)
    ).update({"revoked_at": now})
    audit(db, auth.user.id, "account.sessions_revoked")
    db.commit()
    return {"message": "All sessions signed out."}


@router.delete("/account")
def delete_account(
    payload: DeleteAccountIn, response: Response,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    if not verify_password(payload.password, auth.user.password_hash):
        raise AppError("invalid_password", "Password confirmation failed.", 400)
    user_id = auth.user.id
    db.delete(auth.user)
    db.commit()
    clear_session_cookie(response)
    log_event("account_deleted", user_id=user_id)
    return {"message": "Your account and personal data were deleted."}
