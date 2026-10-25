from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutils import day_bounds_utc, today_local, to_local_date
from app.models.book import BookCategory, Category, UserBook
from app.models.reading import ReadingGoal, ReadingSession
from app.models.user import User, UserSettings
from app.services.metrics import (
    compute_streak, goal_window_progress, longest_streak,
)


def _genre_for(db: Session, ub: UserBook) -> str:
    if ub.genre:
        return ub.genre
    name = db.scalar(
        select(Category.name)
        .join(BookCategory, BookCategory.category_id == Category.id)
        .where(BookCategory.book_id == ub.book_id)
        .limit(1)
    )
    return name or "Uncategorized"


def compute_goal(db: Session, user: User, goal: ReadingGoal, tz: str, today: date | None = None) -> dict:
    today = today or today_local(tz)
    start_utc, _ = day_bounds_utc(goal.start_date, tz)
    _, end_utc = day_bounds_utc(goal.end_date, tz)

    current = 0.0
    extra: dict = {}

    if goal.goal_type in ("books", "genre_books"):
        completed = db.scalars(
            select(UserBook).where(
                UserBook.user_id == user.id,
                UserBook.completed_at.is_not(None),
                UserBook.completed_at >= start_utc,
                UserBook.completed_at < end_utc,
            )
        ).all()
        if goal.goal_type == "genre_books" and goal.genre:
            target_genre = goal.genre.strip().casefold()
            completed = [ub for ub in completed if _genre_for(db, ub).casefold() == target_genre]
        current = float(len(completed))
        extra["books"] = [ub.id for ub in completed]
    elif goal.goal_type in ("pages", "minutes", "hours", "sessions"):
        q = select(
            func.coalesce(func.sum(ReadingSession.pages_read), 0),
            func.coalesce(func.sum(ReadingSession.duration_seconds), 0),
            func.count(ReadingSession.id),
        ).where(
            ReadingSession.user_id == user.id,
            ReadingSession.started_at >= start_utc,
            ReadingSession.started_at < end_utc,
        )
        pages, seconds, count = db.execute(q).one()
        if goal.goal_type == "pages":
            current = float(pages or 0)
        elif goal.goal_type == "minutes":
            current = round((seconds or 0) / 60.0, 2)
        elif goal.goal_type == "hours":
            current = round((seconds or 0) / 3600.0, 2)
        else:
            current = float(count or 0)
    elif goal.goal_type == "streak":
        rows = db.scalars(
            select(ReadingSession.started_at).where(
                ReadingSession.user_id == user.id,
                ReadingSession.started_at >= start_utc,
                ReadingSession.started_at < end_utc,
            )
        ).all()
        days = {to_local_date(dt, tz) for dt in rows}
        current = float(
            compute_streak(days, today) if goal.start_date <= today <= goal.end_date
            else longest_streak(days)
        )

    progress = goal_window_progress(
        goal_type=goal.goal_type,
        target_value=goal.target_value,
        start_date=goal.start_date,
        end_date=goal.end_date,
        today=today,
        current_value=current,
    )
    milestones = [
        {"percent": p, "label": f"{p}%", "reached": progress["percent"] >= p}
        for p in (25, 50, 75, 100)
    ]
    return {
        "id": goal.id,
        "name": goal.name,
        "goal_type": goal.goal_type,
        "period": goal.period,
        "genre": goal.genre,
        "start_date": goal.start_date,
        "end_date": goal.end_date,
        "is_active": goal.is_active,
        "completed_at": goal.completed_at,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
        **progress,
        "milestones": milestones,
        **extra,
    }


def recommendations(db: Session, user: User, settings: UserSettings, tz: str) -> list[dict]:
    today = today_local(tz)
    window_start = today - timedelta(days=89)
    start_utc, _ = day_bounds_utc(window_start, tz)
    _, end_utc = day_bounds_utc(today, tz)

    pages, seconds, sessions = db.execute(
        select(
            func.coalesce(func.sum(ReadingSession.pages_read), 0),
            func.coalesce(func.sum(ReadingSession.duration_seconds), 0),
            func.count(ReadingSession.id),
        ).where(
            ReadingSession.user_id == user.id,
            ReadingSession.started_at >= start_utc,
            ReadingSession.started_at < end_utc,
        )
    ).one()
    books = db.scalar(
        select(func.count(UserBook.id)).where(
            UserBook.user_id == user.id,
            UserBook.completed_at.is_not(None),
            UserBook.completed_at >= start_utc,
            UserBook.completed_at < end_utc,
        )
    ) or 0

    active_days = len({
        to_local_date(dt, tz)
        for dt in db.scalars(
            select(ReadingSession.started_at).where(
                ReadingSession.user_id == user.id,
                ReadingSession.started_at >= start_utc,
                ReadingSession.started_at < end_utc,
            )
        )
    })

    out: list[dict] = []
    if active_days >= 3:
        annual = max(1, round(books / 90 * 365)) if books else 0
        if annual:
            target = max(1, round(annual * 0.9))
            out.append({
                "id": "rec-books-year",
                "name": f"Read {target} books this year",
                "goal_type": "books",
                "period": "year",
                "target_value": target,
                "start_date": date(today.year, 1, 1),
                "end_date": date(today.year, 12, 31),
                "rationale": (
                    f"You completed {books} book(s) across {active_days} reading days in the last 90 days. "
                    f"That pace projects to about {annual} books per year, so {target} is a realistic stretch."
                ),
                "evidence": {"books_last_90_days": books, "active_days": active_days, "projected_annual": annual},
            })
        avg_pages = round(float(pages) / 90, 1)
        if avg_pages >= 1:
            target = max(5, int(round(avg_pages * 1.1)))
            out.append({
                "id": "rec-pages-day",
                "name": f"Read {target} pages per day",
                "goal_type": "pages",
                "period": "day",
                "target_value": target,
                "start_date": today,
                "end_date": date(today.year, 12, 31),
                "rationale": (
                    f"You averaged {avg_pages} pages/day over the last 90 days "
                    f"({int(pages)} pages total). {target} pages/day is a small, sustainable increase."
                ),
                "evidence": {"pages_last_90_days": int(pages), "avg_pages_per_day": avg_pages},
            })
        avg_sessions = round(sessions / 90 * 7, 1)
        if sessions:
            target = max(1, round(avg_sessions))
            out.append({
                "id": "rec-sessions-week",
                "name": f"Read on {target} day(s) per week",
                "goal_type": "sessions",
                "period": "week",
                "target_value": target,
                "start_date": today,
                "end_date": date(today.year, 12, 31),
                "rationale": (
                    f"You logged {int(sessions)} sessions in 90 days (~{avg_sessions}/week). "
                    f"Targeting {target} session(s) per week matches your current habit."
                ),
                "evidence": {"sessions_last_90_days": int(sessions), "avg_sessions_per_week": avg_sessions},
            })
    if not out:
        out.append({
            "id": "rec-start-small",
            "name": "Read 10 minutes per day",
            "goal_type": "minutes",
            "period": "day",
            "target_value": 10,
            "start_date": today,
            "end_date": date(today.year, 12, 31),
            "rationale": (
                "There is not enough recorded reading activity yet to model a pace. "
                "A small daily time goal builds the data this engine needs."
            ),
            "evidence": {"sessions_last_90_days": int(sessions), "active_days": active_days},
        })
    return out
