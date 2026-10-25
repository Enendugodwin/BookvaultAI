from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1, max_length=50000)
    user_book_id: str | None = None
    page_ref: str | None = Field(default=None, max_length=64)
    is_important: bool = False
    tags: list[str] = Field(default_factory=list, max_length=20)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: str | None = Field(default=None, min_length=1, max_length=50000)
    user_book_id: str | None = None
    page_ref: str | None = Field(default=None, max_length=64)
    is_important: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=20)


class HighlightIn(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    user_book_id: str | None = None
    page_ref: str | None = Field(default=None, max_length=64)
    commentary: str | None = Field(default=None, max_length=5000)
    tags: list[str] = Field(default_factory=list, max_length=20)


class HighlightUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=10000)
    page_ref: str | None = Field(default=None, max_length=64)
    commentary: str | None = Field(default=None, max_length=5000)
    tags: list[str] | None = Field(default=None, max_length=20)


class JournalIn(BaseModel):
    entry_date: date
    title: str | None = Field(default=None, max_length=200)
    reflections: str | None = Field(default=None, max_length=20000)
    ideas: str | None = Field(default=None, max_length=20000)
    questions: str | None = Field(default=None, max_length=20000)
    lessons: str | None = Field(default=None, max_length=20000)
    applications: str | None = Field(default=None, max_length=20000)
    mood: str | None = Field(default=None, max_length=32)


class JournalUpdate(BaseModel):
    entry_date: date | None = None
    title: str | None = Field(default=None, max_length=200)
    reflections: str | None = Field(default=None, max_length=20000)
    ideas: str | None = Field(default=None, max_length=20000)
    questions: str | None = Field(default=None, max_length=20000)
    lessons: str | None = Field(default=None, max_length=20000)
    applications: str | None = Field(default=None, max_length=20000)
    mood: str | None = Field(default=None, max_length=32)
