from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Domain error that is safe to show to an API client."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class NotFound(AppError):
    def __init__(self, resource: str = "Resource") -> None:
        super().__init__("not_found", f"{resource} not found.", 404)


class Unauthorized(AppError):
    def __init__(self, message: str = "Authentication required.") -> None:
        super().__init__("unauthorized", message, 401)


class Forbidden(AppError):
    def __init__(self, message: str = "You do not have access to this resource.") -> None:
        super().__init__("forbidden", message, 403)


class Conflict(AppError):
    def __init__(self, message: str, details: Any | None = None) -> None:
        super().__init__("conflict", message, 409, details)


class RateLimited(AppError):
    def __init__(self, message: str = "Too many requests. Try again shortly.", retry_after: int = 60) -> None:
        super().__init__("rate_limited", message, 429, {"retry_after": retry_after})


class ExternalServiceError(AppError):
    def __init__(self, service: str, message: str | None = None) -> None:
        super().__init__(
            "external_service_error",
            message or f"{service} is temporarily unavailable. Core features still work.",
            503,
        )


class AIUnavailable(AppError):
    def __init__(self, message: str = "The AI assistant is not configured.") -> None:
        super().__init__("ai_unavailable", message, 503)
