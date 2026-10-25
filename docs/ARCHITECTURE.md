# YVO's Book Vault — Technical Architecture

Status: implemented baseline (local verification complete; cloud deployment blocked on provider credentials).

## 1. Components

| Component | Technology | Responsibility |
|---|---|---|
| Web client | React 18 + TypeScript + Vite + Tailwind, shadcn-style local component primitives | All 11 product areas, responsive UI, theme, accessibility, timer, charts |
| API | Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2 | Versioned REST API, auth, authorization, validation, aggregation, job dispatch |
| Database | PostgreSQL 16 (managed in production); SQLite for local tests only | Durable relational state, transactions, constraints, indexes |
| Worker | `python -m app.tasks.worker` using a DB-backed queue (`background_jobs`, `FOR UPDATE SKIP LOCKED`) | AI generation, exports, imports, email/report delivery, scheduled notifications |
| Object storage | S3-compatible (Cloudflare R2) in production; local directory in development | Uploaded source documents, generated export files |
| AI provider | OpenAI-compatible HTTP API or Ollama-compatible endpoint; disabled by default | Summaries, chat, recommendations, knowledge extraction |
| Catalogue | Google Books + Open Library, cached in `catalogue_cache` | Metadata discovery; degrades gracefully |
| Email | Resend API (optional) | Reminders and reports; delivery status recorded from provider response |

```mermaid
flowchart LR
  U[Browser] -->|HTTPS + HttpOnly cookie| API[FastAPI<br/>serves built SPA + /api/v1]
  API -->|SQLAlchemy| DB[(Managed PostgreSQL)]
  API -->|enqueue job| DB
  W[Worker process] -->|SKIP LOCKED| DB
  W -->|SMTP/API| EMAIL[Resend]
  W -->|PUT/GET| OBJ[(R2 object storage)]
  API -->|optional| AI[LLM provider]
  W -->|optional| AI
  API -->|optional, cached| CAT[Google Books / Open Library]
```

The API and worker are stateless apart from the database and object storage, so either can be scaled horizontally. The SPA is a static bundle served by the API (or optionally by Vercel/Cloudflare Pages).

## 2. Authentication and authorization

- Registration creates a `users` row plus `user_settings`; password hashed with scrypt (per-user salt, 64-byte output, constant-time compare).
- Login creates an opaque 256-bit session token. Only its SHA-256 hash is stored. The raw token lives in an **HttpOnly** cookie (`bv_session`), `Secure` in production. `SameSite=Lax` for the recommended single-origin deployment; `SameSite=None` only when the SPA is on a different site (for example Vercel + Render).
- Every session row carries a CSRF token. Authenticated state-changing requests must send `X-CSRF-Token`; the server compares it to the session row.
- Session expiry (30 days default) and explicit revocation on logout. Password change and account deletion revoke all sessions.
- Every private query filters by `user_id`. Objects are never fetched by id alone for user access. Cross-user access returns 404 (not 403) to avoid existence leaks. This is covered by automated authorization tests.
- Reset tokens are random, stored hashed, single-use, and expire in 60 minutes. In development the reset URL is returned only when `EXPOSE_RESET_TOKEN=true` (never in production). Verification tokens expire in 48 hours. Both link to dedicated SPA pages (`/reset-password`, `/verify-email`) that handle missing, expired and already-used tokens.
- Rate limits: in-process sliding-window limiter on auth endpoints (per IP) and per-user daily AI quotas persisted in `ai_usage_records`.

Threat assumptions: HTTPS terminates at the platform; cookies are `Secure` in production. XSS is mitigated with React escaping, a strict CSP, and no `dangerouslySetInnerHTML` on user or AI content (Markdown rendered as preformatted text). SQL injection is prevented by SQLAlchemy parameter binding. Uploaded files are validated by size/type/extension and never executed or served inline.

## 3. Core calculations (single source of truth)

Implemented in `app/services/metrics.py`:

- `pages_read = max(0, end_page - start_page)` for a session; unknown page counts are allowed and excluded from page aggregates.
- `progress_percent = current_page / page_count * 100` clamped to 0–100; `None` when `page_count` is unknown/zero (never divide by zero).
- `pages_per_hour = pages_read / (duration_seconds / 3600)`; `None` for zero duration.
- Session duration is wall-clock between `started_at` and `ended_at` minus explicitly paused seconds (`paused_seconds`).
- Sessions crossing midnight are stored in UTC and counted on the **local date of `started_at`** using the user's timezone for heatmaps/reports. A session is aggregated exactly once.
- Streak: count consecutive local days with at least one completed session ending today or yesterday. A gap of one day breaks the streak.
- Goal progress is computed from the goal's own `[start_date, end_date]` window, never from a calendar-year assumption. Required pace = remaining target ÷ remaining whole days (minimum 1).
- Analytics only read persisted sessions/books. Deleting a session immediately removes it from all aggregates.
- Book completion is explicit (`status=completed` sets `completed_at`); it is never inferred.

## 4. AI design

`AIProvider` protocol with implementations:

1. `OpenAICompatibleProvider` — `POST {base_url}/chat/completions` with bearer key.
2. `OllamaProvider` — `POST {base_url}/api/chat`.
3. `DisabledProvider` — raises a typed `AIUnavailable`, enabling graceful degradation.

Prompts are built only from: catalogue metadata, the user's own notes/highlights, and text they uploaded. Each request records provider/model/tokens/status in `ai_usage_records`. Returned text is labelled with coverage (`metadata_only`, `notes_only`, `document_extract`, `mixed`) and a caveat. The system prompt forbids inventing quotations, page numbers, or chapter content. AI output is never auto-persisted into notes — knowledge extraction returns reviewable candidate insights.

Long-running AI work runs via `background_jobs`; the API returns `202` with a job id, and the client polls `/jobs/{id}`.

## 5. Data flow examples

**Add a book from discovery:** SPA → `GET /catalogue/search` (cached, 10s timeout) → user selects → `POST /books` with metadata → canonical `books` row (deduplicated by ISBN then normalized title+author) → `user_books` row for the caller.

**Reading session:** timer posts start → optional pause/resume accumulates paused seconds → end sends `{started_at, ended_at, paused_seconds, start_page, end_page}` → server validates ranges and timestamps → inserts session and updates `current_page` in one transaction → aggregates recomputed on read.

**Export:** `POST /exports` creates `export_jobs` + `background_jobs` → worker builds CSV/JSON/Markdown/PDF, stores to object storage (or local) → status endpoint exposes a short-lived download URL. CSV cells beginning with `= + - @` are prefixed with `'` (formula-injection defense).

## 6. Deployment topology

Recommended: one Docker image serves the built SPA and the API from the same origin. This keeps cookies `SameSite=Lax`, avoids cross-site credential issues and needs one TLS endpoint.

- `bookvault-api`: Docker image at `Dockerfile`; runs `alembic upgrade head`, then `uvicorn app.main:app`; health check `/api/v1/health`. FastAPI serves the SPA from `FRONTEND_DIST_DIR` with an `index.html` fallback for client routes.
- `bookvault-worker`: same codebase, command `python -m app.tasks.worker`; scales independently.
- Database: managed PostgreSQL 16 with automated backups.
- Storage: private Cloudflare R2 bucket (or AWS S3).
- Optional: Resend for email, OpenAI-compatible or local Ollama for AI.
- Optional split deployment: static SPA on Vercel (`frontend/vercel.json`) with `VITE_API_URL` pointing at the API. That requires `COOKIE_SAMESITE=none` and both origins on HTTPS.

`render.yaml` expresses the recommended topology: managed PostgreSQL, a Docker web service and a Python worker. `docker-compose.yml` does the same on a single VM with a one-shot `migrate` service. Configuration is entirely environment-variable driven; see `.env.example`. Startup fails fast in production if required secrets, PostgreSQL, cookie security, reset-token exposure or selected integrations are misconfigured.

Deployment assets are authored but were never applied here; there was no Docker daemon and no provider credentials. See `docs/DEPLOYMENT.md` and `PROGRESS.md`.

## 7. Deliberate limits

- No Kubernetes or microservices: a single API image + worker + managed Postgres is sufficient for the expected load and cheaper to operate.
- The in-process rate limiter is per-instance; for multi-instance deployments move it to Redis (documented).
- The catalogue depends on third-party availability; the UI shows explicit degraded states.
- AI is optional and disabled unless configured; no output is fabricated when it is off.
