from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

STATUS_PATTERN = "^(want_to_read|reading|completed|paused|abandoned|rereading)$"


class BookInput(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    authors: list[str] = Field(default_factory=list, max_length=20)
    isbn10: str | None = Field(default=None, max_length=20)
    isbn13: str | None = Field(default=None, max_length=24)
    description: str | None = Field(default=None, max_length=20000)
    publisher: str | None = Field(default=None, max_length=255)
    published_date: str | None = Field(default=None, max_length=32)
    language: str | None = Field(default=None, max_length=32)
    page_count: int | None = Field(default=None, ge=1, le=100000)
    cover_url: str | None = Field(default=None, max_length=1000)
    categories: list[str] = Field(default_factory=list, max_length=20)
    genre: str | None = Field(default=None, max_length=120)
    google_books_id: str | None = Field(default=None, max_length=64)
    openlibrary_id: str | None = Field(default=None, max_length=64)

    status: str = Field(default="want_to_read", pattern=STATUS_PATTERN)
    rating: float | None = Field(default=None, ge=0, le=5)
    review: str | None = Field(default=None, max_length=20000)
    current_page: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Title is required.")
        return v

    @field_validator("authors", "categories", "tags")
    @classmethod
    def _clean_list(cls, v: list[str]) -> list[str]:
        out, seen = [], set()
        for item in v:
            item = " ".join(str(item).split())
            if item and item.lower() not in seen:
                seen.add(item.lower())
                out.append(item)
        return out

    @field_validator("isbn10")
    @classmethod
    def _isbn10(cls, v):
        if v is None:
            return v
        v = re.sub(r"[^0-9Xx]", "", v).upper()
        if v and not re.fullmatch(r"\d{9}[\dX]", v):
            raise ValueError("ISBN-10 must contain 10 digits (last may be X).")
        return v or None

    @field_validator("isbn13")
    @classmethod
    def _isbn13(cls, v):
        if v is None:
            return v
        v = re.sub(r"[^0-9]", "", v)
        if v and not re.fullmatch(r"97[89]\d{10}", v):
            raise ValueError("ISBN-13 must be 13 digits starting with 978 or 979.")
        return v or None

    @model_validator(mode="after")
    def _page_sanity(self):
        if self.current_page is not None and self.page_count and self.current_page > self.page_count:
            raise ValueError("Current page cannot exceed the book's page count.")
        return self


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    authors: list[str] | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=20000)
    publisher: str | None = Field(default=None, max_length=255)
    published_date: str | None = Field(default=None, max_length=32)
    language: str | None = Field(default=None, max_length=32)
    page_count: int | None = Field(default=None, ge=1, le=100000)
    cover_url: str | None = Field(default=None, max_length=1000)
    genre: str | None = Field(default=None, max_length=120)
    status: str | None = Field(default=None, pattern=STATUS_PATTERN)
    rating: float | None = Field(default=None, ge=0, le=5)
    review: str | None = Field(default=None, max_length=20000)
    current_page: int | None = Field(default=None, ge=0)
    tags: list[str] | None = Field(default=None, max_length=30)
    archived: bool | None = None


class BulkStatusIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)
    status: str = Field(pattern=STATUS_PATTERN)


class ProgressIn(BaseModel):
    current_page: int = Field(ge=0)
    notes: str | None = Field(default=None, max_length=5000)


class CompleteIn(BaseModel):
    rating: float | None = Field(default=None, ge=0, le=5)
    review: str | None = Field(default=None, max_length=20000)
    completed_at: datetime | None = None


class AuthorOut(BaseModel):
    name: str


class BookOut(BaseModel):
    id: str
    title: str
    subtitle: str | None
    authors: list[str]
    isbn10: str | None
    isbn13: str | None
    description: str | None
    publisher: str | None
    published_date: str | None
    language: str | None
    page_count: int | None
    cover_url: str | None
    categories: list[str]
    google_books_id: str | None
    openlibrary_id: str | None


class UserBookOut(BaseModel):
    id: str
    book: BookOut
    status: str
    rating: float | None
    review: str | None
    current_page: int | None
    progress_percent: float | None
    started_at: datetime | None
    completed_at: datetime | None
    archived: bool
    genre: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
