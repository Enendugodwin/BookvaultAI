from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.services.exporter import csv_safe
from app.services.metrics import (
    compute_streak, goal_window_progress, longest_streak, pages_per_hour,
    pages_read, progress_percent, session_duration_seconds,
)


def test_session_duration_excludes_pauses_and_never_negative():
    start = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    assert session_duration_seconds(start, start + timedelta(minutes=40), 300) == 2100
    assert session_duration_seconds(start, start + timedelta(minutes=5), 400) == 0


def test_pages_read_requires_both_pages_and_never_negative():
    assert pages_read(10, 45) == 35
    assert pages_read(45, 10) == 0
    assert pages_read(None, 20) is None
    assert pages_read(10, None) is None


def test_progress_percent_handles_unknown_and_zero_page_counts():
    assert progress_percent(50, 200) == 25.0
    assert progress_percent(300, 200) == 100.0
    assert progress_percent(10, None) is None
    assert progress_percent(10, 0) is None
    assert progress_percent(10, -5) is None


def test_pages_per_hour():
    assert pages_per_hour(30, 3600) == 30.0
    assert pages_per_hour(30, 0) is None
    assert pages_per_hour(None, 3600) is None


def test_streak_counts_consecutive_days_ending_today_or_yesterday():
    today = date(2026, 10, 24)
    assert compute_streak({today, today - timedelta(days=1), today - timedelta(days=2)}, today) == 3
    assert compute_streak({today - timedelta(days=1), today - timedelta(days=2)}, today) == 2
    assert compute_streak({today - timedelta(days=2)}, today) == 0
    assert compute_streak(set(), today) == 0


def test_longest_streak_with_gaps():
    start = date(2026, 1, 1)
    days = {start, start + timedelta(days=1), start + timedelta(days=2), start + timedelta(days=5)}
    assert longest_streak(days) == 3


def test_goal_progress_pace_and_completion():
    result = goal_window_progress(
        goal_type="pages", target_value=100, start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 10), today=date(2026, 10, 5), current_value=40,
    )
    assert result["percent"] == 40.0
    assert result["remaining"] == 60
    assert result["days_remaining"] == 6
    assert result["required_pace"] == 10.0
    assert result["completed"] is False

    done = goal_window_progress(
        goal_type="books", target_value=5, start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31), today=date(2026, 10, 5), current_value=5,
    )
    assert done["completed"] is True
    assert done["percent"] == 100.0
    assert done["required_pace"] == 0.0


def test_goal_after_end_date_has_no_remaining_days():
    result = goal_window_progress(
        goal_type="pages", target_value=100, start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30), today=date(2026, 10, 1), current_value=50,
    )
    assert result["days_remaining"] == 0


def test_csv_formula_injection_is_neutralised():
    assert csv_safe("=SUM(A1)") == "'=SUM(A1)"
    assert csv_safe("+1") == "'+1"
    assert csv_safe("-2") == "'-2"
    assert csv_safe("@cmd") == "'@cmd"
    assert csv_safe("normal text") == "normal text"
    assert csv_safe(42) == "42"
    assert csv_safe(None) == ""
