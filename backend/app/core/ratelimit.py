"""Small in-process sliding-window limiter for auth endpoints.

For horizontally scaled deployments this should move to Redis; documented in
docs/OPERATIONS.md. It is intentionally conservative and fail-open on internal
errors so it can never take the whole API down.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.core.errors import RateLimited

_lock = threading.Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)


def check(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry = max(1, int(bucket[0] + window_seconds - now))
            raise RateLimited(retry_after=retry)
        bucket.append(now)


def reset() -> None:
    with _lock:
        _buckets.clear()
