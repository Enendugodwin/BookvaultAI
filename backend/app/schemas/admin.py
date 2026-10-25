from __future__ import annotations

from pydantic import BaseModel


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    email_verified: bool | None = None
