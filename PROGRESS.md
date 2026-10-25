# Build progress

Last updated: 2026-10-25

This file is the source of truth for what is built, what was verified, and what
is still blocked. It is intentionally specific so the next session does not
have to guess.

## Status summary

| Area | State |
| --- | --- |
| Backend application | Complete |
| Database schema + initial migration | Complete, applied to local SQLite |
| Frontend application | Complete |
| Backend tests | 48 passed |
| Frontend tests | 15 passed |
| End-to-end API smoke | Passed |
| TypeScript typecheck | Passed |
| Production frontend build | Passed |
| Live browser walkthrough | Passed (login, all pages, admin portal, themes, add book, CSV import, journal, password reset, email verification) |
| Mobile responsiveness | Verified at 320, 375 and 390 px: no horizontal overflow on 13 routes |
| Demo seed | Complete and verified |
| Deployment assets | Authored (Docker, Compose, Render, Vercel root + frontend, CI) |
| Cloud deployment | **Blocked** - no cloud credentials, no Docker daemon |
| Public URL / cloud database | **None** |

## Checklist

### Backend
- [x] Configuration, logging, request IDs, error envelope, CORS
- [x] SQLAlchemy models (users, settings, sessions, books, library, sessions,
      goals, notes/highlights/journal, notifications, jobs, imports/exports,
      AI summaries/conversations/documents, audit)
- [x] Alembic setup and initial migration (`f6f2ec6b1c95`)
- [x] Auth: register, login, logout, me, onboarding, profile, settings,
      password change/forgot/reset, email verify/resend, account delete,
      session list/revoke
- [x] Admin API: metrics, account search/filter, activity log, account update,
      session revocation, account deletion, self/last-admin guards
- [x] CSV/JSON import accepts `cover_url` in the template and validates it
- [x] Library CRUD, facets, stats, completion suggestions
- [x] Catalogue search/ISBN lookup with Open Library + optional Google Books
- [x] Reading sessions and timer support, validation, idempotency keys
- [x] Goals, progress, recommended goals
- [x] Analytics overview, ranges, heatmap, streaks
- [x] Notes, highlights, journal, knowledge search/overview
- [x] AI status, summaries, conversations with citations, insights,
      recommendations, document upload
- [x] Notifications, report previews, optional Resend email
- [x] CSV/JSON import preview and commit, CSV template (with `cover_url`)
- [x] Exports: CSV, JSON, Markdown, PDF, ZIP
- [x] Persistent background jobs + worker (`FOR UPDATE SKIP LOCKED`)
- [x] S3-compatible storage with local fallback
- [x] Production fail-fast configuration validation
- [x] psycopg 3 normalization for managed PostgreSQL URLs

### Frontend
- [x] Vite + React + TypeScript + Tailwind setup, path alias, API proxy
- [x] Design system primitives (button, input, card, badge, dialog, toast,
      tabs, progress, skeleton, empty state, avatar)
- [x] Auth/theme providers, protected/public routes, app shell
- [x] Pages: login, register, onboarding, dashboard, library, reading,
      book detail, goals, analytics, discover, notes, journal, notifications,
      assistant, settings, admin, not found
- [x] Password reset and email verification pages with token/error states
- [x] Add/edit book, import, export, reading session, goal, note, highlight,
      journal dialogs
- [x] Eight themes (System, Parchment, Night, Pink, Midnight, Purple, Forest,
      Sepia) with persisted preference and mobile browser chrome colour
- [x] Mobile bottom navigation, slide-over menu, safe-area padding and stacked
      cards for account/session history
- [x] Responsive layouts down to 320 px, keyboard focus states and reduced
      motion support
- [x] Administrator portal with metrics, filters, mobile cards, activity feed,
      confirmations and guarded account actions
- [x] Route-level code splitting and vendor chunking
- [x] Typecheck and production build
- [x] Job polling with honest queued/running/failed states
- [x] Typecheck and production build

### Operations and docs
- [x] `Dockerfile` (multi-stage; frontend served by FastAPI)
- [x] `docker-compose.yml` (Postgres, migrate, API, worker)
- [x] `render.yaml` (managed Postgres, Docker web, Python worker)
- [x] `vercel.json` (repo root) and `frontend/vercel.json`
- [x] `.github/workflows/ci.yml`
- [x] `.env.example`, `docker.env.example`
- [x] `README.md`, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`,
      `docs/DEPLOYMENT.md`
- [x] Demo seed (`backend/scripts/seed.py`) with production guard; the local
      demo account is an administrator
- [x] Dedicated GitHub deploy key generated outside the repo
      (`C:\Users\user\.ssh\bookvault_github`, fingerprint
      `SHA256:5xlgt1TbG4fTz3TOzDa6h0QBGVRLAWvBdri3yJSXhfA`)
- [ ] Build the Docker image (Docker not installed here)
- [ ] Apply `render.yaml` or deploy Compose to a host
- [ ] Provision PostgreSQL / S3 / Resend / AI credentials
- [ ] Configure a domain and TLS

## Verification log

All commands were run from the repository root unless noted.

### Backend tests

```powershell
cd backend
$env:PYTHONPATH="."
..\.venv\Scripts\python.exe -m pytest tests -q
```

Result: `48 passed` (2 upstream deprecation warnings from Starlette's
TestClient and ReportLab).

### End-to-end API smoke

```powershell
cd backend
$env:PYTHONPATH="."
..\.venv\Scripts\python.exe scripts\smoke.py
```

Result: `ALL SMOKE CHECKS PASSED`.

### Frontend tests, typecheck and build

```powershell
cd frontend
npm test
npm run typecheck
npm run build
```

Result: `15 passed` (3 files); typecheck clean; Vite build succeeded
(`frontend/dist`). Route-level lazy loading plus vendor chunking reduced the
initial payload to ~300 kB uncompressed (~90 kB gzip); the chart chunk is loaded
only on analytics.

### Database and seed

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe scripts\seed.py --create
```

Result: migrations applied through `a7b8c9d0e1f2` (admin role); demo account
`demo@bookvault.io` is an administrator with 8 books, 18 sessions, notes,
highlights, a journal entry and 2 goals.

### Live server and browser walkthrough

The API was served with the built frontend:

```powershell
$env:FRONTEND_DIST_DIR="C:\Users\user\BookVaultAI\frontend\dist"
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Verified with HTTP and a real headless Chrome session:

- `/`, `/library`, `/books/:id` return the SPA; `/api/v1/*` remains JSON;
  unknown API paths return 404
- Security headers present: API responses use `default-src 'none'` CSP and
  `no-store`; SPA HTML uses a self-only script CSP with no browser violations
- Login works; all main pages render without an error boundary
- `/admin` renders live metrics, account filters, activity and session actions;
  a non-admin account receives 403 from the admin API
- Themes switch immediately (including Midnight) and persist; the mobile
  `theme-color` meta tag follows the active theme
- Add-book dialog creates a book; searchable
- CSV import previews, queues, the worker commits it, and the book appears
- Journal entry saves and renders
- Appearance settings switch themes and persist
- Assistant shows the "AI is not active on this deployment" state honestly
- Forgot-password returns a reset URL in development; the reset page accepts
  the token, changes the password, and the new password signs in
- Verification token page confirms the address and reports success
- Worker processed import and export jobs (`completed`); CSV export downloaded

Some page loads before sign-in log one expected `401` for `/auth/me`; the auth
provider treats that as "signed out".

## Deployment blocker

No cloud deployment was performed. The workspace had:

- no Docker daemon, so `Dockerfile` / Compose were never built or run
- no Render, Railway, Fly.io, Vercel or Cloudflare credentials
- no managed PostgreSQL instance
- no S3/R2 bucket or keys
- no Resend key or verified sending domain
- no AI provider key
- no domain/TLS certificate
- no Git remote configured

The deployment files are complete, but they are configuration, not proof of a
running service. Do not claim a URL, credential, uptime or live integration
until one exists.

## Next steps for a real deployment

1. Push the repository to GitHub using the generated key
   (`C:\Users\user\.ssh\bookvault_github`); add the matching `.pub` file as a
   deploy key or account SSH key first.
2. For a Vercel frontend, import the repo, set `VITE_API_URL` to the API origin,
   and set `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` on the API. The worker
   and API still need a long-running host.
3. Build the image once on a machine with Docker:
   `docker build -t bookvault-ai .`
4. For a VM: create `.env` from `docker.env.example`, set a real
   `SECRET_KEY`, `POSTGRES_PASSWORD`, `APP_URL` and S3 credentials, then
   `docker compose up -d --build`.
5. For Render: create the R2 bucket, apply `render.yaml`, fill every
   `sync: false` value, and set `FRONTEND_URL` / `ALLOWED_ORIGINS` to the
   assigned HTTPS origin.
6. Confirm `/api/v1/health` is 200 and the worker logs show it is polling.
7. Register the first real account (do not seed production), then enable
   Resend/AI only if required.
8. Configure backups, a log drain, and an uptime check on `/api/v1/health`.
