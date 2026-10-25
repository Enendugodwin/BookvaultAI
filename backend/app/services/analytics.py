from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutils import (
    day_bounds_utc, range_days, to_local_date, today_local,
)
from app.models.book import BookCategory, Category, UserBook
from app.models.reading import ReadingGoal, ReadingSession
from app.models.user import User, UserSettings
from app.services.goals import compute_goal
from app.services.metrics import compute_streak, progress_percent


def resolve_range(
    preset: str | None, start: date | None, end: date | None, tz: str
) -> tuple[date, date]:
    today = today_local(tz)
    if preset in (None, "", "30d"):
        return today - timedelta(days=29), today
    if preset == "7d":
        return today - timedelta(days=6), today
    if preset == "month":
        return today.replace(day=1), today
    if preset == "year":
        return date(today.year, 1, 1), today
    if preset == "prev_year":
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)
    if preset == "custom":
        if not start or not end:
            raise ValueError("Custom ranges need both start and end dates.")
        if end < start:
            raise ValueError("End date must not be before start date.")
        if (end - start).days > 731:
            raise ValueError("Custom ranges are limited to two years.")
        return start, end
    raise ValueError("Unknown range preset.")


def _sessions_between(db: Session, user_id: str, start: date, end: date, tz: str):
    start_utc, _ = day_bounds_utc(start, tz)
    _, end_utc = day_bounds_utc(end, tz)
    return db.scalars(
        select(ReadingSession).where(
            ReadingSession.user_id == user_id,
            ReadingSession.started_at >= start_utc,
            ReadingSession.started_at < end_utc,
        ).order_by(ReadingSession.started_at)
    ).all()


def _genre_map(db: Session, user_books: list[UserBook]) -> dict[str, str]:
    book_ids = [ub.book_id for ub in user_books]
    cat_map: dict[str, str] = {}
    if book_ids:
        rows = db.execute(
            select(BookCategory.book_id, Category.name)
            .join(Category, Category.id == BookCategory.category_id)
            .where(BookCategory.book_id.in_(book_ids))
        ).all()
        for book_id, name in rows:
            cat_map.setdefault(book_id, name)
    return {ub.id: (ub.genre or cat_map.get(ub.book_id) or "Uncategorized") for ub in user_books}


def _totals(sessions: list[ReadingSession], completed_count: int) -> dict:
    return {
        "books_completed": completed_count,
        "pages": int(sum(s.pages_read or 0 for s in sessions)),
        "minutes": round(sum(s.duration_seconds for s in sessions) / 60.0, 1),
        "sessions": len(sessions),
    }


def summary(db: Session, user: User, settings: UserSettings) -> dict:
    tz = settings.timezone
    today = today_local(tz)
    year_start = date(today.year, 1, 1)
    year_utc, _ = day_bounds_utc(year_start, tz)
    _, tomorrow_utc = day_bounds_utc(today + timedelta(days=1), tz)

    total_books = db.scalar(
        select(func.count(UserBook.id)).where(UserBook.user_id == user.id, UserBook.archived.is_(False))
    ) or 0
    completed_year = db.scalar(
        select(func.count(UserBook.id)).where(
            UserBook.user_id == user.id,
            UserBook.completed_at.is_not(None),
            UserBook.completed_at >= year_utc,
            UserBook.completed_at < tomorrow_utc,
        )
    ) or 0
    currently = db.scalar(
        select(func.count(UserBook.id)).where(
            UserBook.user_id == user.id,
            UserBook.status.in_(("reading", "rereading")),
            UserBook.archived.is_(False),
        )
    ) or 0
    wishlist = db.scalar(
        select(func.count(UserBook.id)).where(
            UserBook.user_id == user.id,
            UserBook.status == "want_to_read",
            UserBook.archived.is_(False),
        )
    ) or 0

    pages, seconds, session_count = db.execute(
        select(
            func.coalesce(func.sum(ReadingSession.pages_read), 0),
            func.coalesce(func.sum(ReadingSession.duration_seconds), 0),
            func.count(ReadingSession.id),
        ).where(ReadingSession.user_id == user.id)
    ).one()

    day_rows = db.scalars(
        select(ReadingSession.started_at).where(ReadingSession.user_id == user.id)
    ).all()
    streak = compute_streak({to_local_date(d, tz) for d in day_rows}, today)

    goals = db.scalars(
        select(ReadingGoal).where(
            ReadingGoal.user_id == user.id,
            ReadingGoal.is_active.is_(True),
            ReadingGoal.goal_type.in_(("books", "genre_books")),
            ReadingGoal.start_date <= today,
            ReadingGoal.end_date >= today,
        ).order_by(ReadingGoal.end_date)
    ).all()
    annual = None
    for goal in goals:
        if goal.period == "year" or goal.start_date == year_start:
            annual = compute_goal(db, user, goal, tz, today)
            break
    if annual is None:
        annual = {
            "name": "Set an annual reading goal",
            "goal_type": "books",
            "target_value": 0,
            "current_value": completed_year,
            "percent": 0,
            "remaining": 0,
            "id": None,
        }

    return {
        "total_books": total_books,
        "completed_this_year": completed_year,
        "currently_reading": currently,
        "wishlist": wishlist,
        "total_pages_read": int(pages or 0),
        "total_minutes_read": round(float(seconds or 0) / 60.0, 1),
        "total_sessions": int(session_count or 0),
        "current_streak": streak,
        "year": today.year,
        "annual_goal": annual,
    }


def overview(db: Session, user: User, settings: UserSettings, start: date, end: date) -> dict:
    tz = settings.timezone
    start_utc, _ = day_bounds_utc(start, tz)
    _, end_utc = day_bounds_utc(end, tz)

    sessions = _sessions_between(db, user.id, start, end, tz)
    completed = db.scalars(
        select(UserBook).where(
            UserBook.user_id == user.id,
            UserBook.completed_at.is_not(None),
            UserBook.completed_at >= start_utc,
            UserBook.completed_at < end_utc,
        )
    ).all()
    library = db.scalars(
        select(UserBook).where(UserBook.user_id == user.id, UserBook.archived.is_(False))
    ).all()
    genre_by_ub = _genre_map(db, library)

    daily: dict[date, dict] = defaultdict(lambda: {"pages": 0, "minutes": 0.0, "sessions": 0})
    for s in sessions:
        d = to_local_date(s.started_at, tz)
        daily[d]["pages"] += s.pages_read or 0
        daily[d]["minutes"] = round(daily[d]["minutes"] + s.duration_seconds / 60.0, 1)
        daily[d]["sessions"] += 1

    monthly: dict[str, dict] = defaultdict(lambda: {"pages": 0, "minutes": 0.0, "sessions": 0, "books": 0})
    for s in sessions:
        key = to_local_date(s.started_at, tz).strftime("%Y-%m")
        monthly[key]["pages"] += s.pages_read or 0
        monthly[key]["minutes"] = round(monthly[key]["minutes"] + s.duration_seconds / 60.0, 1)
        monthly[key]["sessions"] += 1
    for ub in completed:
        key = to_local_date(ub.completed_at, tz).strftime("%Y-%m")
        monthly[key]["books"] += 1

    months = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        key = cursor.strftime("%Y-%m")
        row = monthly.get(key, {"pages": 0, "minutes": 0.0, "sessions": 0, "books": 0})
        months.append({"month": key, **row})
        cursor = date(cursor.year + (cursor.month == 12), (cursor.month % 12) + 1, 1)

    days = [
        {"date": d.isoformat(), **daily.get(d, {"pages": 0, "minutes": 0.0, "sessions": 0})}
        for d in range_days(start, end)
    ]

    status_counts: dict[str, int] = defaultdict(int)
    genre_counts: dict[str, int] = defaultdict(int)
    ratings: dict[str, list[float]] = defaultdict(list)
    for ub in library:
        status_counts[ub.status] += 1
        genre = genre_by_ub[ub.id]
        genre_counts[genre] += 1
        if ub.rating is not None:
            ratings[genre].append(float(ub.rating))

    prev_span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=prev_span - 1)
    prev_sessions = _sessions_between(db, user.id, prev_start, prev_end, tz)
    prev_completed = db.scalar(
        select(func.count(UserBook.id)).where(
            UserBook.user_id == user.id,
            UserBook.completed_at.is_not(None),
            UserBook.completed_at >= day_bounds_utc(prev_start, tz)[0],
            UserBook.completed_at < day_bounds_utc(prev_end, tz)[1],
        )
    ) or 0

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": prev_span},
        "totals": _totals(sessions, len(completed)),
        "previous_totals": _totals(prev_sessions, int(prev_completed)),
        "daily": days,
        "monthly": months,
        "genres": [
            {"genre": g, "count": c} for g, c in sorted(genre_counts.items(), key=lambda x: -x[1])
        ],
        "status_counts": dict(status_counts),
        "ratings_by_genre": [
            {"genre": g, "average": round(sum(v) / len(v), 2), "count": len(v)}
            for g, v in sorted(ratings.items(), key=lambda x: -len(x[1]))
        ],
    }


def heatmap(db: Session, user: User, year: int, metric: str = "pages") -> dict:
    tz = user.settings.timezone if user.settings else "UTC"
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    sessions = _sessions_between(db, user.id, start, end, tz)
    daily: dict[date, dict] = defaultdict(lambda: {"pages": 0, "minutes": 0.0, "sessions": 0})
    for s in sessions:
        d = to_local_date(s.started_at, tz)
        daily[d]["pages"] += s.pages_read or 0
        daily[d]["minutes"] = round(daily[d]["minutes"] + s.duration_seconds / 60.0, 1)
        daily[d]["sessions"] += 1
    values = []
    for d in range_days(start, end):
        row = daily.get(d, {"pages": 0, "minutes": 0.0, "sessions": 0})
        values.append({"date": d.isoformat(), "value": row.get(metric, 0), **row})
    return {
        "year": year,
        "metric": metric,
        "days": values,
        "max_value": max([v["value"] for v in values], default=0),
        "total": round(sum(v["value"] for v in values), 2),
    }


def day_detail(db: Session, user: User, day: date, tz: str) -> dict:
    sessions = _sessions_between(db, user.id, day, day, tz)
    out = []
    for s in sessions:
        ub = s.user_book
        out.append({
            "id": s.id,
            "user_book_id": s.user_book_id,
            "title": ub.book.title if ub and ub.book else "Unknown book",
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "minutes": round(s.duration_seconds / 60.0, 1),
            "pages_read": s.pages_read,
            "notes": s.notes,
        })
    return {"date": day.isoformat(), "sessions": out}


def currently_reading(db: Session, user: User) -> list[dict]:
    tz = user.settings.timezone if user.settings else "UTC"
    items = db.scalars(
        select(UserBook).where(
            UserBook.user_id == user.id,
            UserBook.status.in_(("reading", "rereading")),
            UserBook.archived.is_(False),
        ).order_by(UserBook.updated_at.desc())
    ).all()
    now = datetime.now(timezone.utc)
    out = []
    for ub in items:
        last = db.scalar(
            select(ReadingSession.ended_at).where(
                ReadingSession.user_id == user.id, ReadingSession.user_book_id == ub.id
            ).order_by(ReadingSession.ended_at.desc()).limit(1)
        )
        recent = db.scalars(
            select(ReadingSession).where(
                ReadingSession.user_id == user.id,
                ReadingSession.user_book_id == ub.id,
                ReadingSession.started_at >= now - timedelta(days=30),
            )
        ).all()
        pages_recent = sum(s.pages_read or 0 for s in recent)
        avg_per_day = pages_recent / 30 if pages_recent else 0
        est = None
        if ub.book.page_count and ub.current_page is not None and avg_per_day > 0:
            remaining = max(0, ub.book.page_count - ub.current_page)
            est = (today_local(tz) + timedelta(days=max(1, round(remaining / avg_per_day)))).isoformat()
        out.append({
            "id": ub.id,
            "book": {
                "id": ub.book.id,
                "title": ub.book.title,
                "authors": [ba.author.name for ba in []],  # filled in route via serializer
                "cover_url": ub.book.cover_url,
                "page_count": ub.book.page_count,
            },
            "current_page": ub.current_page,
            "progress_percent": progress_percent(ub.current_page, ub.book.page_count),
            "last_read_at": last,
            "estimated_completion_date": est,
            "avg_pages_per_day_30d": round(avg_per_day, 1),
        })
    return out
