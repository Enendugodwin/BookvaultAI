# Deployment guide

This document describes how to deploy YVO's Book Vault. The configuration in this
repository has **not** been applied to any cloud account. No public URL, cloud
credentials or managed database exists. Treat every command below as unexecuted
until you run it in your own account.

## What you need

| Requirement | Why | Status in this workspace |
| --- | --- | --- |
| Git repository on GitHub/GitLab | Render/Vercel deploy from Git | Local git repo only; no remote configured |
| Render account (or another container host) | API, worker, PostgreSQL | Not available here |
| Docker Engine 24+ (for Compose) | Build/run the image locally or on a VM | Docker was not installed on this machine, so the image was never built |
| Cloudflare R2 or AWS S3 bucket | Durable uploads in production | Not provisioned |
| Resend account + verified domain | Verification/reset/reminder email | Optional; not configured |
| OpenAI-compatible key or local Ollama | AI features | Optional; not configured |
| Domain + TLS certificate | Secure cookies and email links | Not configured |

The application, migrations, tests and build all work without these services.
Only the deployment itself is blocked.

## Topology A - one container (recommended)

The Docker image builds the React app and serves it from FastAPI, so the
browser talks to a single origin. Cookies use `SameSite=Lax` and no CORS
preflight is needed.

```text
Internet -> TLS proxy / platform -> bookvault-api (FastAPI + static SPA)
                                          |
                                          +-> PostgreSQL
                                          +-> S3 / R2 (uploads)
                                          +-> Resend (optional)
                                          +-> AI provider (optional)

bookvault-worker -> PostgreSQL (jobs) -> S3 / Resend / AI
```

### A1. Docker Compose on a VM

1. Install Docker Engine and the Compose plugin.
2. Copy the repo to the VM.
3. Create the environment file:

   ```bash
   cp docker.env.example .env
   ```

4. Edit `.env`:

   ```dotenv
   ENVIRONMENT=production
   COOKIE_SECURE=true
   APP_URL=https://books.example.com
   PORT=8000
   SECRET_KEY=<openssl rand -hex 32>
   POSTGRES_PASSWORD=<strong random password>
   STORAGE_BACKEND=s3
   S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   S3_BUCKET=bookvault
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_REGION=auto
   ```

   For a local HTTP smoke test only, use `ENVIRONMENT=development`,
   `COOKIE_SECURE=false`, `APP_URL=http://localhost:8000`, and
   `STORAGE_BACKEND=local`.

5. Build and start:

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs -f migrate api worker
   ```

   The `migrate` service runs `alembic upgrade head` once and must exit 0
   before `api` and `worker` start. The API serves the SPA on
   `http://localhost:8000`; `/api/v1/health` should return 200.

6. Put TLS in front. Example Caddyfile:

   ```caddy
   books.example.com {
       reverse_proxy 127.0.0.1:8000
   }
   ```

   Or nginx:

   ```nginx
   server {
       listen 443 ssl http2;
       server_name books.example.com;
       client_max_body_size 25m;

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

7. Create the first account through `/register`, complete onboarding, and use
   the app. Do **not** run `scripts/seed.py` against production; production
   seeding requires an explicit `--force` for a reason.

8. Verify the worker is alive before relying on imports/exports/AI:

   ```bash
   docker compose logs -f worker
   ```

   If it is stopped, jobs stay `queued` and the UI says so.

9. Back up PostgreSQL:

   ```bash
   docker compose exec -T db pg_dump -U bookvault bookvault | gzip > backup-$(date +%F).sql.gz
   ```

10. Upgrade later:

    ```bash
    git pull
    docker compose build
    docker compose run --rm migrate
    docker compose up -d api worker
    ```

### A2. Render blueprint

`render.yaml` defines:

- `bookvault-db` - managed PostgreSQL 16
- `bookvault-api` - Docker web service; builds `Dockerfile`, runs migrations on
  start, serves API + frontend; health check `/api/v1/health`
- `bookvault-worker` - Python worker for imports, exports, reminders and AI jobs

Steps:

1. Push this repository to GitHub.
2. Create a private R2 bucket and an S3 API token limited to it.
3. In Render: **New -> Blueprint**, connect the repo, select `render.yaml`.
4. Fill every `sync: false` value when prompted:

   | Key | Value |
   | --- | --- |
   | `FRONTEND_URL` | `https://<service-name>.onrender.com` (or your domain) |
   | `ALLOWED_ORIGINS` | same exact origin |
   | `S3_ENDPOINT_URL` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_BUCKET` | bucket name |
   | `S3_ACCESS_KEY_ID` | R2/S3 access key |
   | `S3_SECRET_ACCESS_KEY` | R2/S3 secret |
   | `S3_REGION` | `auto` for R2 |

   `SECRET_KEY` is generated by Render. The worker reads the same value via
   `fromService`.

5. Apply the blueprint. Watch the API logs for `api_started`; if configuration
   is incomplete, startup intentionally fails and logs `configuration_problem`.
6. Confirm the worker service is running. Open the API URL, register, and
   complete onboarding.
7. Optional: add a custom domain, then update `FRONTEND_URL` and
   `ALLOWED_ORIGINS` to the custom HTTPS origin and redeploy.
8. Optional: set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and a verified
   `EMAIL_FROM`.
9. Optional: set `AI_PROVIDER=openai` (or `ollama` with a reachable
   `AI_BASE_URL`), `AI_API_KEY`, `AI_MODEL`. Users must still opt in.
10. Enable Render database backups and set an alert on failed deploys.

The blueprint uses paid `starter` plans. Change the plan values if you are
creating a disposable demo; free databases expire and free web services sleep.

## Topology B - Vercel frontend + API elsewhere

Vercel can host the **static React frontend only**. The FastAPI API, PostgreSQL
database and background worker need a long-running host (topology A). Deploy the
API first and note its HTTPS origin, then choose one of these Vercel setups:

- **Root-directory setup:** import the repo, set **Root Directory** to
  `frontend`, framework preset Vite, build `npm run build`, output `dist`.
  `frontend/vercel.json` supplies the SPA rewrites, CSP and caching.
- **Repository-root setup:** leave Root Directory empty. The root
  `vercel.json` runs `cd frontend && npm ci` / `npm run build` and publishes
  `frontend/dist`.

Then:

1. Add `VITE_API_URL=https://api.example.com` to the Vercel project
   (Production and Preview). It must be the API origin, without `/api/v1`.
2. On the backend set:

   ```dotenv
   FRONTEND_URL=https://books.example.com
   ALLOWED_ORIGINS=https://books.example.com
   COOKIE_SECURE=true
   COOKIE_SAMESITE=none
   ```

   `SameSite=None` requires HTTPS on both sides and may be affected by
   browser third-party-cookie policy. Topology A avoids that class of problem.

3. Redeploy both. Sign in and confirm `/auth/me` returns 200 with credentials.

## Administrator access

Accounts listed in `ADMIN_EMAILS` (comma-separated) are promoted automatically
when they register or sign in. The repository default is
`enendugodwin@gmail.com`; change it before sharing a deployment, and only list
addresses you control because registration does not require email verification.

Any other account can be promoted from the backend directory after it exists;
there is no unauthenticated bootstrap route:

```bash
python scripts/admin.py promote owner@example.com
python scripts/admin.py list
```

Revoking the last active administrator is refused. Guards also prevent an
administrator from suspending, demoting, deleting themselves, or revoking their
own sessions through the API.

## Database migrations

- Local: `alembic upgrade head` from `backend/`
- Compose: handled by the `migrate` service (and the image CMD as a fallback)
- Render: the Docker command runs `alembic upgrade head` before uvicorn; the
  worker also runs it before starting
- Check the current revision: `alembic current`
- Never edit an applied migration; add a new revision

For multiple API replicas, run migrations once as a release step and remove
the migration command from the start command to avoid concurrent DDL.

## Background worker

There is no Redis or Celery. Jobs live in `background_jobs` and the worker uses
`FOR UPDATE SKIP LOCKED` on PostgreSQL, so multiple worker processes are safe.

Run it with:

```bash
cd backend
python -m app.tasks.worker
```

If the worker is absent, API requests still succeed but imports, exports,
reminders and AI generation remain queued. The frontend polls job status and
warns after a delay. This is deliberate: it does not claim success.

## Object storage

Production validation requires `STORAGE_BACKEND=s3` plus bucket and access key.
Use a private bucket. The API returns files through authenticated endpoints;
no bucket CORS or public policy is needed.

R2 notes:

- Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- Region: `auto`
- Leave `S3_SERVER_SIDE_ENCRYPTION` empty (R2 encrypts at rest)
- AWS S3 users may set `S3_SERVER_SIDE_ENCRYPTION=AES256`

Local storage (`STORAGE_BACKEND=local`) is fine for development and for a VM
with a persistent volume. It is not durable on Render/Fly/Cloud Run ephemeral
filesystems.

## Email

1. Create a Resend account and verify the sending domain.
2. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`.
3. Set `FRONTEND_URL` to the public app origin so verification and reset links
   point at the right host.
4. Register a test account and use **Settings -> Notifications -> Send test
   email**.

Without email, in-app notifications still work. Password reset links are only
returned in the API when `EXPOSE_RESET_TOKEN=true`, which production refuses.

When you enable email on Render, add the same `EMAIL_*` variables to **both**
the `bookvault-api` and `bookvault-worker` services. The worker sends reminders
and reports.

## AI

- `AI_PROVIDER=disabled` is the default and is a valid production state.
- `openai` works with any OpenAI-compatible chat-completions endpoint.
- `ollama` with `AI_BASE_URL=http://host.docker.internal:11434/v1` can keep
  inference local; the container must be able to reach it.
- Users must enable AI and external-processing consent in Settings. The
  assistant page shows an honest "not active" state otherwise.

AI output is not treated as fact. Summaries and chat include citations to the
user's own library/notes, and the UI tells the reader to verify against the
source.

When you enable AI on Render, add `AI_*` variables to **both** the API and the
worker. Summaries and insight extraction run in the worker.

## Health, logs and operations

- Health: `GET /api/v1/health` (no auth)
- API docs: `/docs` outside production; disabled in production
- Logs: structured JSON on stdout with request IDs. Use the platform log drain.
- Metrics: request logs plus job rows (`queued`, `running`, `completed`,
  `failed`) in `background_jobs`.
- Backups: enable managed PostgreSQL backups; test a restore.
- Timezone: reminder scheduling uses each user's stored IANA timezone.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Container exits at startup with `configuration_problem` | Missing production secret, SQLite URL, insecure cookie, exposed reset token, or incomplete S3/AI/email settings |
| Login sets a cookie but the next request is unauthenticated | Different site without `COOKIE_SAMESITE=none`, or frontend/API origins not both HTTPS |
| `403 csrf_failed` | Missing `X-CSRF-Token`; the official client handles this, custom clients must send it |
| Import/export stays queued | Worker not running, or worker and API use different `DATABASE_URL` |
| Covers/avatars 404 after redeploy | Local storage on an ephemeral filesystem; switch to S3/R2 |
| `psycopg` import error | `psycopg[binary]` not installed; install `backend/requirements.txt` |
| Password reset email link 404 | Frontend router must serve `/reset-password`; the SPA fallback in `app/main.py` or Vercel rewrites handles this |

## Deployment blocker (exact)

At the time this was written, the workspace had:

- no Docker daemon (`docker` not installed), so the image was not built or run
- no Render/Railway/Fly/Vercel account token or CLI session
- no managed PostgreSQL instance
- no R2/S3 bucket or keys
- no Resend key or verified domain
- no AI provider key
- no domain or TLS certificate
- no Git remote configured for this repository

Because of those missing credentials, **no cloud deployment, public URL,
database, or email/AI integration has been created or verified**. The local
verification results are real and reproducible; see `PROGRESS.md`.
