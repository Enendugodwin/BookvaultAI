from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_datetime(value: str) -> datetime:
    """Parse an ISO-8601 timestamp; reject naive values to avoid ambiguity."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Timestamp must include a timezone offset.")
    return dt.astimezone(timezone.utc)


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def valid_timezone(name: str | None) -> str:
    try:
        ZoneInfo(name or "UTC")
        return name or "UTC"
    except (ZoneInfoNotFoundError, ValueError):
        return "UTC"


def to_local_date(dt: datetime, tz: str) -> date:
    return ensure_utc(dt).astimezone(ZoneInfo(valid_timezone(tz))).date()


def day_bounds_utc(day: date, tz: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(valid_timezone(tz))
    start = datetime.combine(day, time.min, tzinfo=zone).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    return start, end


def today_local(tz: str) -> date:
    return utcnow().astimezone(ZoneInfo(valid_timezone(tz))).date()


def range_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]
