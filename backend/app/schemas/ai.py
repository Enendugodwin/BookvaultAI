from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

SUMMARY_KINDS = (
    "short", "detailed", "main_arguments", "key_ideas", "takeaways",
    "applications", "discussion_questions", "revision_notes", "flashcards",
    "chapter_summary",
)


class SummaryIn(BaseModel):
    user_book_id: str
    kind: str = Field(default="short", pattern="^(" + "|".join(SUMMARY_KINDS) + ")$")
    length: str = Field(default="medium", pattern="^(short|medium|long)$")
    document_ids: list[str] = Field(default_factory=list, max_length=5)


class ConversationIn(BaseModel):
    user_book_id: str | None = None
    title: str | None = Field(default=None, max_length=200)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class InsightExtractIn(BaseModel):
    user_book_id: str | None = None
    limit_notes: int = Field(default=40, ge=5, le=100)


class RecommendationIn(BaseModel):
    count: int = Field(default=6, ge=1, le=12)
    include_rereads: bool = False


class ShareToggleIn(BaseModel):
    enabled: bool


class AIConfigStatus(BaseModel):
    enabled: bool
    provider: str
    model: str | None
    configured: bool
    external_processing: bool
    daily_limit: int
    used_today: int
    remaining_today: int
    message: str


class SummaryOut(BaseModel):
    id: str
    user_book_id: str
    kind: str
    length: str
    content: str
    coverage: str
    coverage_note: str | None
    sources: list
    provider: str | None
    model: str | None
    created_at: datetime
