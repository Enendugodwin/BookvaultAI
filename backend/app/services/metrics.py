"""Canonical metric calculations. All analytics endpoints use these helpers."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.core.timeutils import to_local_date


def session_duration_seconds(started_at: datetime, ended_at: datetime, paused_seconds: int = 0) -> int:
    raw = int((ended_at - started_at).total_seconds())
    return max(0, raw - max(0, paused_seconds))


def pages_read(start_page: int | None, end_page: int | None) -> int | None:
    if start_page is None or end_page is None:
        return None
    return max(0, end_page - start_page)


def progress_percent(current_page: int | None, page_count: int | None) -> float | None:
    if not page_count or page_count <= 0 or current_page is None:
        return None
    return round(min(100.0, max(0.0, current_page / page_count * 100)), 1)


def pages_per_hour(pages: int | None, duration_seconds: int | None) -> float | None:
    if not pages or not duration_seconds or duration_seconds <= 0:
        return None
    return round(pages / (duration_seconds / 3600), 1)


def compute_streak(local_days: set[date] | list[date], today: date) -> int:
    days = set(local_days)
    if today in days:
        cursor = today
    elif today - timedelta(days=1) in days:
        cursor = today - timedelta(days=1)
    else:
        return 0
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(days: set[date]) -> int:
    best = run = 0
    prev: date | None = None
    for d in sorted(days):
        if prev is not None and d == prev + timedelta(days=1):
            run += 1
        else:
            run = 1
        best = max(best, run)
        prev = d
    return best


def goal_window_progress(
    *,
    goal_type: str,
    target_value: float,
    start_date: date,
    end_date: date,
    today: date,
    current_value: float,
) -> dict:
    """Progress/pace math for a goal with an arbitrary window."""
    target = float(target_value)
    current = float(current_value)
    percent = 0.0 if target <= 0 else round(min(100.0, max(0.0, current / target * 100)), 1)
    remaining = max(0.0, target - current)
    total_days = max(1, (end_date - start_date).days + 1)
    if today < start_date:
        remaining_days = total_days
    elif today > end_date:
        remaining_days = 0
    else:
        remaining_days = (end_date - today).days + 1
    elapsed_days = max(1, min(total_days, (min(today, end_date) - start_date).days + 1))
    required_pace = round(remaining / max(1, remaining_days), 2) if remaining > 0 and remaining_days else 0.0
    avg_per_day = current / elapsed_days
    eta_days = int(remaining / avg_per_day) if remaining > 0 and avg_per_day > 0 else (0 if remaining == 0 else None)
    eta_date = (today + timedelta(days=eta_days)).isoformat() if eta_days is not None else None
    predicted_total = round(avg_per_day * total_days, 1)
    return {
        "current_value": round(current, 2),
        "target_value": round(target, 2),
        "percent": percent,
        "remaining": round(remaining, 2),
        "days_remaining": remaining_days,
        "total_days": total_days,
        "required_pace": required_pace,
        "current_pace": round(avg_per_day, 2),
        "estimated_completion_date": eta_date,
        "predicted_total": predicted_total,
        "on_track": percent >= round(elapsed_days / total_days * 100, 1) or remaining == 0,
        "completed": current >= target,
    }
