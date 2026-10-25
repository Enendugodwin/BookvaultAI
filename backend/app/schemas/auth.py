from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def _check_password(value: str) -> str:
    if len(value) < 10:
        raise ValueError("Password must be at least 10 characters.")
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must include at least one letter and one digit.")
    return value


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)

    _pw = field_validator("password")(_check_password)

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Display name is required.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=10, max_length=128)

    _pw = field_validator("new_password")(_check_password)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)

    _pw = field_validator("new_password")(_check_password)


class DeleteAccountIn(BaseModel):
    password: str


class VerifyEmailIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class SettingsIn(BaseModel):
    timezone: str | None = Field(default=None, max_length=64)
    theme: str | None = Field(default=None, pattern="^(light|dark|system)$")
    preferred_genres: list[str] | None = Field(default=None, max_length=30)
    reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    reminder_days: list[int] | None = None
    notify_inapp: bool | None = None
    notify_email: bool | None = None
    weekly_summary: bool | None = None
    monthly_report: bool | None = None
    ai_enabled: bool | None = None
    ai_external_consent: bool | None = None
    page_size: int | None = Field(default=None, ge=6, le=100)
    library_view: str | None = Field(default=None, pattern="^(grid|table|compact)$")

    @field_validator("reminder_days")
    @classmethod
    def _days(cls, v):
        if v is None:
            return v
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Reminder days must be 0 (Monday) through 6 (Sunday).")
        return sorted(set(v))


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)


class OnboardingIn(BaseModel):
    annual_goal: int | None = Field(default=None, ge=1, le=1000)
    genres: list[str] = Field(default_factory=list, max_length=30)
    import_later: bool = True
    reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    notify_email: bool = False
    ai_consent: bool = False
    skip: bool = False


class SettingsOut(BaseModel):
    timezone: str
    theme: str
    preferred_genres: list[str]
    onboarded: bool
    reminder_time: str
    reminder_days: list[int]
    notify_inapp: bool
    notify_email: bool
    weekly_summary: bool
    monthly_report: bool
    ai_enabled: bool
    ai_external_consent: bool
    page_size: int
    library_view: str


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    email_verified: bool
    created_at: datetime
    settings: SettingsOut
    csrf_token: str | None = None


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str | None
    current: bool = False
