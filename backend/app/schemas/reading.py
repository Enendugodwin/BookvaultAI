from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

GOAL_TYPE_PATTERN = "^(books|pages|minutes|hours|sessions|streak|genre_books)$"


def _aware(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is None:
        raise ValueError("Timestamps must include a timezone (ISO-8601 with offset).")
    return v


class SessionIn(BaseModel):
    started_at: datetime
    ended_at: datetime
    paused_seconds: int = Field(default=0, ge=0, le=86400)
    start_page: int | None = Field(default=None, ge=0)
    end_page: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=5000)

    _tz = field_validator("started_at", "ended_at")(_aware)

    @model_validator(mode="after")
    def _range(self):
        if self.ended_at <= self.started_at:
            raise ValueError("Session end must be after its start.")
        if (self.ended_at - self.started_at).total_seconds() > 24 * 3600:
            raise ValueError("A single reading session cannot exceed 24 hours.")
        if self.start_page is not None and self.end_page is not None and self.end_page < self.start_page:
            raise ValueError("End page cannot be before start page.")
        return self


class SessionUpdate(BaseModel):
    started_at: datetime | None = None
    ended_at: datetime | None = None
    paused_seconds: int | None = Field(default=None, ge=0, le=86400)
    start_page: int | None = Field(default=None, ge=0)
    end_page: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=5000)

    _tz = field_validator("started_at", "ended_at")(_aware)


class TimerStartIn(BaseModel):
    user_book_id: str
    start_page: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    started_at: datetime | None = None

    _tz = field_validator("started_at")(_aware)


class TimerStopIn(BaseModel):
    end_page: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=5000)


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    goal_type: str = Field(pattern=GOAL_TYPE_PATTERN)
    period: str = Field(default="custom", pattern="^(day|week|month|year|custom)$")
    target_value: float = Field(gt=0, le=1_000_000)
    start_date: date
    end_date: date
    genre: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Goal end date must not be before the start date.")
        if self.goal_type == "genre_books" and not self.genre:
            raise ValueError("A genre is required for genre-based goals.")
        return self


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    target_value: float | None = Field(default=None, gt=0, le=1_000_000)
    start_date: date | None = None
    end_date: date | None = None
    genre: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None
