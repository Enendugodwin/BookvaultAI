from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import log_event, request_id_var

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}

# The SPA needs its own assets, Google Fonts, remote cover images and API calls.
# React style props require 'unsafe-inline' for styles; scripts stay self-only.
SPA_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Adds a request id, security headers, and structured request timing."""

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        request_id_var.set(rid)
        started = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception:
            log_event(
                "request_failed",
                path=request.url.path,
                method=request.method,
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
                level=40,
            )
            raise
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        response.headers["X-Request-ID"] = rid
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            )
        elif (
            response.headers.get("content-type", "").startswith("text/html")
            and not request.url.path.startswith(("/docs", "/redoc"))
        ):
            response.headers.setdefault("Content-Security-Policy", SPA_CSP)
        log_event(
            "request",
            path=request.url.path,
            method=request.method,
            status=response.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000, 1),
        )
        return response
