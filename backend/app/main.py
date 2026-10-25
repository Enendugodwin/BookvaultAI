from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.api.router import api_router
from app.core.config import settings, validate_runtime_config
from app.core.errors import AppError
from app.core.logging import configure_logging, log_event, request_id_var
from app.core.middleware import RequestContextMiddleware

VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    problems = validate_runtime_config()
    for problem in problems:
        log_event("configuration_problem", level=40, problem=problem)
    if problems and settings.is_production:
        raise RuntimeError("Refusing to start with unsafe production configuration: " + "; ".join(problems))
    log_event("api_started", environment=settings.environment, version=VERSION)
    yield
    log_event("api_stopped")


app = FastAPI(
    title="BookVault AI API",
    version=VERSION,
    description=(
        "Reading library, session tracking, analytics, goals, knowledge base, "
        "catalogue discovery and optional AI assistance."
    ),
    docs_url="/docs" if not settings.is_production else None,
    redoc_url=None,
    openapi_url="/api/v1/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
    max_age=600,
)


def _error_body(code: str, message: str, details=None) -> dict:
    body = {
        "error": {"code": code, "message": message, "request_id": request_id_var.get()},
    }
    if details is not None:
        body["error"]["details"] = details
    return body


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    headers = {}
    if exc.status_code == 429 and isinstance(exc.details, dict) and exc.details.get("retry_after"):
        headers["Retry-After"] = str(exc.details["retry_after"])
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(_error_body(exc.code, exc.message, exc.details)),
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    details = []
    for err in exc.errors():
        details.append({
            "field": ".".join(str(p) for p in err.get("loc", []) if p != "body"),
            "message": err.get("msg", "Invalid value"),
            "type": err.get("type"),
        })
    return JSONResponse(
        status_code=422,
        content=_error_body("validation_error", "Please check the highlighted fields.", details),
    )


@app.exception_handler(IntegrityError)
async def integrity_handler(request: Request, exc: IntegrityError):
    log_event("integrity_error", level=30, path=request.url.path)
    return JSONResponse(
        status_code=409,
        content=_error_body("conflict", "That change conflicts with existing data."),
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log_event(
        "unhandled_error", level=40, path=request.url.path,
        error_type=type(exc).__name__, error=str(exc)[:500],
    )
    return JSONResponse(
        status_code=500,
        content=_error_body("internal_error", "Something went wrong on our side. Please retry."),
    )


app.include_router(api_router, prefix=settings.api_prefix)

# Optional single-service frontend hosting. When FRONTEND_DIST_DIR points at a
# built Vite bundle, serve its assets and use index.html as the SPA fallback.
_frontend_dir: Path | None = None
if settings.frontend_dist_dir:
    candidate_dir = Path(settings.frontend_dist_dir).expanduser().resolve()
    if (candidate_dir / "index.html").is_file():
        _frontend_dir = candidate_dir
        assets_dir = candidate_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")


@app.get("/")
def root():
    if _frontend_dir is not None:
        return FileResponse(_frontend_dir / "index.html")
    return {
        "service": "BookVault AI API",
        "version": VERSION,
        "docs": "/docs" if not settings.is_production else None,
        "api": settings.api_prefix,
    }


if _frontend_dir is not None:
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith(("api/", "docs", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (_frontend_dir / full_path).resolve()
        if _frontend_dir in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_frontend_dir / "index.html")
