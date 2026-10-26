# Deployment guide

YVO's Book Vault runs as one Vercel project:

- **Frontend** — the Vite build in `frontend/`, served by the same FastAPI app.
- **API** — `main.py` at the repository root is the Vercel Python entrypoint.
- **Database** — Vercel Postgres (Neon), exposed as `POSTGRES_URL`.
- **Files** — a private Vercel Blob store.
- **Jobs** — user-triggered jobs run inside the request; a daily Vercel Cron
  drains schedules and leftovers.

## Current production deployment

- **URL:** https://bookvaultai.vercel.app
- **Vercel project:** `godswim/bookvaultai` (root directory `.`, FastAPI preset)
- **Production deployment:** `dpl_CqLRcEjiE8noV6DxEGkSjRgwE9ur`
- **Database:** Neon/Vercel Postgres, production environment connected
- **Storage:** private Vercel Blob, production environment connected
- **Cron:** daily at 08:00 UTC with `CRON_SECRET`

The steps below document how that deployment was built and how to reproduce it
in a fresh Vercel account. Never commit `.env` files, connection strings, tokens
or the `.vercel/` directory.

## 1. Import the project

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project** and import the repository.
3. Set **Root Directory** to the repository root (leave it empty). Do **not**
   select `frontend/`. The root project contains both the Vite app and the Python
   function.
4. Vercel should detect the FastAPI entrypoint `main.py`. Leave the framework
   preset and build command from `vercel.json` in place:
   - Build: `cd frontend && npm ci && npm run build && rm -rf ../backend/frontend_dist && cp -r dist ../backend/frontend_dist`
   - Function: `main.py`, 1024 MB, 60 s max duration (raise to 300 on Pro if
     you use long AI calls), with `includeFiles: "backend/**"`
   - Output: served by FastAPI, not a separate static output directory

   The build copies the Vite bundle to `backend/frontend_dist` so it is inside
   the function bundle. `main.py` falls back to `frontend/dist` for local runs.

`vercel.json` also defines the SPA headers, CSP and the daily cron. The old
`frontend/vercel.json` proxy to Render has been removed.

### If the project already exists

`bookvaultai` was originally a frontend-only project. It has been converted:

- **Settings → General → Root Directory** is `.`.
- The framework preset is **FastAPI**; build/install/output settings are
  auto-detected and `vercel.json` supplies the build command.
- The stale `VITE_API_URL` pointing at Render was removed.
- The Vite project no longer contains a `/api/*` proxy to Render.

If you recreate the project, repeat those changes before the first deployment.

## 2. Create the Vercel Postgres database

1. In the Vercel project, open **Storage → Create Database → Postgres**.
2. Connect it to the project and choose a region close to the functions.
3. Confirm the project now has `POSTGRES_URL` and
   `POSTGRES_URL_NON_POOLING` in **Settings → Environment Variables**.

The app prefers `POSTGRES_URL` at runtime and uses
`POSTGRES_URL_NON_POOLING` for Alembic. Remove any old `DATABASE_URL` that points
at Render; it is ignored on Vercel when `POSTGRES_URL` exists, but leaving it is
confusing.

### Migrations

Alembic runs automatically on the first cold start. The app takes a PostgreSQL
advisory lock so concurrent cold starts cannot apply migrations twice. The
function bundle includes `backend/alembic.ini` and `backend/migrations/`.

To run migrations as a separate release step instead:

1. Set `AUTO_MIGRATE=false` in Vercel.
2. From a machine with the non-pooling URL:

   ```bash
   cd backend
   export DATABASE_URL='<POSTGRES_URL_NON_POOLING>'
   alembic upgrade head
   ```

3. Redeploy.

## 3. Create private Blob storage

1. In the Vercel project, open **Storage → Create → Blob**.
2. Create a **private** store and connect it to the project.
3. Set `STORAGE_BACKEND=vercel_blob`.
4. A connected store injects `BLOB_STORE_ID` / OIDC credentials. For local
   development, set `BLOB_READ_WRITE_TOKEN` instead.

Uploads and generated exports are private. The API streams them only after an
authenticated, owner-scoped request. Do not switch the app to public blob URLs.

## 4. Production environment variables

Set these in **Vercel → Settings → Environment Variables** for Production (and
Preview if you want previews to work):

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | `openssl rand -hex 32` (32+ random characters) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `lax` |
| `EXPOSE_RESET_TOKEN` | `false` |
| `ADMIN_EMAILS` | `enendugodwin@gmail.com` (or the owner address you control) |
| `FRONTEND_URL` | `https://bookvaultai.vercel.app` or your custom HTTPS origin |
| `ALLOWED_ORIGINS` | same exact origin as `FRONTEND_URL` |
| `STORAGE_BACKEND` | `vercel_blob` |
| `CRON_SECRET` | a random secret, e.g. `openssl rand -hex 24` |
| `AUTO_MIGRATE` | `true` |
| `CRON_JOB_LIMIT` | `2` |
| `MAX_UPLOAD_MB` | `4` |

`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `BLOB_STORE_ID` and the Blob OIDC
credentials come from the Vercel integrations. Do not paste database passwords
or Blob tokens into the repository.

Vercel Functions accept roughly 4.5 MB request bodies. Set
`MAX_UPLOAD_MB=4` so imports and AI-document uploads fail with a clear app error
rather than an edge 413. Larger uploads need direct-to-Blob uploads or the
container/S3 topology.

Optional:

| Variable | Value |
| --- | --- |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | `openai` plus a key, or leave disabled |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | `resend` plus a verified domain, or leave disabled |
| `GOOGLE_BOOKS_API_KEY` | optional catalogue quota increase |

Do **not** set `VITE_API_URL` to the old Render URL. The Vercel frontend uses
same-origin `/api/v1` requests, so the session cookie remains first-party.

## 5. Deploy and verify

1. Trigger a deployment.
2. Wait for the frontend build and Python function packaging to finish.
3. Open `https://<project>.vercel.app/api/v1/health`.

   Expect HTTP 200 with `"environment": "production"`.

4. Open `/api/v1/health/ready`.

   Expect `"database": true`, `"storage_backend": "vercel_blob"`, and an empty
   `config_problems` list.

5. Register or sign in as the address in `ADMIN_EMAILS`. The account is promoted
   automatically; confirm `/api/v1/auth/me` reports `role: administrator`.
6. Create a book, export it, and download the export. This exercises Postgres,
   Blob storage and inline job execution.
7. Check **Vercel → Logs** for `api_started`, `migration_failed` or
   `job_started_inline`.

## 6. Cron and background jobs

Vercel Functions do not keep the `python -m app.tasks.worker` process alive.
Instead:

- Exports, imports, AI summaries, document extraction and email jobs are claimed
  and completed before the API request returns. The response carries the final
  status (for example `ready` or `completed`).
- The cron endpoint `/api/v1/internal/jobs/tick` runs daily at 08:00 UTC. It
  creates notifications due in a 30-minute window, reaps interrupted jobs older
  than 10 minutes, and processes up to `CRON_JOB_LIMIT` queued jobs.
- Vercel sends `Authorization: Bearer <CRON_SECRET>`. If `CRON_SECRET` is unset,
  the endpoint returns 503 by design.

Vercel Hobby limits cron frequency to once per day. That is enough for immediate
user jobs, but a daily tick can only catch reminder times near 08:00 UTC. If you
need per-minute reminder scheduling, upgrade the plan or call the same endpoint
from an external scheduler with the bearer secret.

## 7. Administrator access

Accounts listed in `ADMIN_EMAILS` (comma-separated) are promoted automatically
on registration and login. The repository default is
`enendugodwin@gmail.com`. Only list addresses you control; registration does not
require email verification.

To inspect or promote an existing account from a machine with the production
database URL:

```bash
cd backend
export DATABASE_URL='<POSTGRES_URL_NON_POOLING>'
python scripts/admin.py list
python scripts/admin.py promote owner@example.com
```

Revoking the last active administrator is refused. Administrators cannot
suspend, demote, delete or revoke their own sessions through the API.

## 8. Database backup and data migration

Enable backups/retention on the Vercel Postgres store and test a restore.

If you need to copy data from the old Render database into Vercel Postgres:

```bash
# Read-only dump from the old database (use its current, rotated credentials).
pg_dump --no-owner --no-acl "$OLD_DATABASE_URL" > bookvault.sql

# Restore into the direct Vercel Postgres URL.
psql "$POSTGRES_URL_NON_POOLING" < bookvault.sql

# Let Alembic record/verify the current revision.
cd backend
DATABASE_URL="$POSTGRES_URL_NON_POOLING" alembic upgrade head
```

The Render database password that was shared in chat is compromised. Rotate it
or delete that database after migration.

## 9. Local development

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
$env:PYTHONPATH="."
uvicorn app.main:app --reload --port 8010

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

The local app is `http://127.0.0.1:8010`; the Vite dev server proxies or uses
`VITE_API_URL` as configured. Tests:

```bash
cd backend
$env:PYTHONPATH="."
..\.venv\Scripts\python.exe -m pytest tests -q

cd ../frontend
npm run typecheck
npm test -- --run
npm run build
```

## 10. Alternative: container host

`Dockerfile`, `docker-compose.yml` and `render.yaml` remain for a long-running
host. That topology uses the persistent worker and can use S3/R2 instead of
Vercel Blob. It is no longer the documented default. For a container deploy:

```bash
docker compose up -d --build
docker compose logs -f migrate api worker
```

Set `DATABASE_URL` to PostgreSQL, `STORAGE_BACKEND=s3` (or local with a
persistent volume), and run the worker. The app still auto-migrates by default,
but the container entrypoint also runs `alembic upgrade head`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Deployment fails at startup with `SECRET_KEY must be ...` | Missing/short `SECRET_KEY` in Vercel; generate a new 32+ character value |
| `/api/v1/health/ready` returns 503 with `database: false` | Postgres store not connected, or `POSTGRES_URL` missing |
| `migration_failed` in logs | First cold start could not reach the non-pooling URL, or the schema revision conflicts |
| Frontend returns 404 or the API JSON at `/` | Vercel Root Directory is `frontend/` or the wrong `vercel.json` is active; set it to the repository root |
| Login cookie is not sent | Frontend and API are on different sites, or `COOKIE_SECURE` is false over HTTPS |
| `403 csrf_failed` | Missing `X-CSRF-Token`; the official client adds it automatically |
| Export/import/AI stays queued | Inline jobs were disabled on a non-Vercel host, or the cron secret is missing |
| Uploads or exports disappear after a while | `STORAGE_BACKEND=local` on Vercel; use `vercel_blob` |
| `psycopg` import error | `psycopg[binary]` missing from the installed requirements |
| Function bundle too large | Remove unused optional dependencies or move exports to Blob/S3; the limit is 250 MB |

## What is verified locally

- Backend test suite, including Vercel URL resolution, Blob access, cron auth and
  inline export execution.
- Frontend typecheck, tests and production build.
- Root `main.py` serves `/`, `/assets/*`, SPA routes and `/api/v1/health` from one
  FastAPI app.

Actual Vercel deployment, database connectivity, Blob uploads and admin login
must be verified in your Vercel account after the environment variables above
are set.
