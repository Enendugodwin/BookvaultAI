# Environment reference

YVO's Book Vault reads configuration from environment variables. Locally it also
loads an `.env` file from the current directory or the repository root, so
running from `backend/` with a root `.env` works.

Copy `.env.example` to `.env` for development. Never commit `.env`.

## Required in every environment

| Variable | Default | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. Production enables fail-fast safety checks. |
| `SECRET_KEY` | insecure dev value | At least 32 random characters in production. Generate with `openssl rand -hex 32`. Changing it invalidates short-lived tokens. |
| `DATABASE_URL` | `sqlite:///./bookvault.db` | Use PostgreSQL in production. Plain `postgresql://` and `postgres://` URLs are mapped to the bundled psycopg 3 driver. |
| `FRONTEND_URL` | `http://localhost:5173` | Public origin used in email links. No trailing slash. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins. Must include the exact browser origin. |
| `ADMIN_EMAILS` | `enendugodwin@gmail.com` | Comma-separated emails automatically granted administrator access on registration/login. Keep private; only use addresses you control. |

`DATABASE_URL` examples:

```text
sqlite:///./bookvault.db
postgresql+psycopg://bookvault:password@localhost:5432/bookvault
postgresql://user:password@host:5432/db?sslmode=require
```

## Sessions and cookies

| Variable | Default | Notes |
| --- | --- | --- |
| `COOKIE_NAME` | `bv_session` | Cookie name. |
| `COOKIE_SECURE` | `false` | Must be `true` in production (HTTPS). |
| `COOKIE_SAMESITE` | `lax` | `lax` for same-origin deployments. Use `none` (with `COOKIE_SECURE=true`) only when the frontend is on a different site, e.g. Vercel + Render. |
| `SESSION_TTL_HOURS` | `720` | Absolute session lifetime. |
| `EXPOSE_RESET_TOKEN` | `true` | Development convenience. Must be `false` in production; production startup refuses otherwise. |

The browser stores only an opaque session token in an HttpOnly cookie. CSRF
tokens are per-session, returned on login/`/auth/me`, and must be sent as
`X-CSRF-Token` on cookie-authenticated mutations. Bearer tokens are supported
for API clients and are exempt from CSRF.

## Catalogue

| Variable | Default | Notes |
| --- | --- | --- |
| `GOOGLE_BOOKS_API_KEY` | empty | Optional. Open Library works without a key; Google Books raises rate limits. |
| `CATALOGUE_TIMEOUT_SECONDS` | `10` | Upstream request timeout. |
| `CATALOGUE_CACHE_MINUTES` | `720` | In-process catalogue cache TTL. |

## AI (optional)

AI is disabled by default. Enabling it at the server does **not** enable it for
users: each account must also turn on AI and external-processing consent in
Settings. With `AI_PROVIDER=ollama`, no data leaves the host if the Ollama
server is local.

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `disabled` | `disabled`, `openai` (any OpenAI-compatible endpoint) or `ollama`. |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Use `http://localhost:11434/v1` for a local Ollama. |
| `AI_API_KEY` | empty | Required for `openai`; ignored for Ollama. |
| `AI_MODEL` | `gpt-4o-mini` | Must support chat completions. |
| `AI_TIMEOUT_SECONDS` | `45` | Provider request timeout. |
| `AI_DAILY_REQUESTS_PER_USER` | `25` | Per-user daily AI call budget. |
| `AI_MAX_INPUT_CHARS` | `24000` | Caps prompt context sent to the provider. |

Production validation requires `AI_BASE_URL` for any enabled provider and an
API key for `openai`.

## Email (optional)

In-app notifications work without email. Set `EMAIL_PROVIDER=resend` and a
verified sending domain to deliver verification, reset, reminder and report
emails.

| Variable | Default | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `disabled` | `disabled` or `resend`. |
| `RESEND_API_KEY` | empty | Required when Resend is enabled. |
| `EMAIL_FROM` | `YVO's Book Vault <no-reply@example.com>` | Must be allowed by the provider/domain. |

If email is disabled, the notifications page explains that delivery is off
instead of claiming an email was sent. With `EXPOSE_RESET_TOKEN=true` the
forgot-password response also includes a reset URL for local testing.

## Storage

| Variable | Default | Notes |
| --- | --- | --- |
| `STORAGE_BACKEND` | `local` | `local` or `s3`. Use `s3` on ephemeral container hosts. |
| `STORAGE_LOCAL_DIR` | `./storage` | Local directory, relative to the process working directory. |
| `S3_ENDPOINT_URL` | empty | Cloudflare R2: `https://<account-id>.r2.cloudflarestorage.com`. AWS: leave empty. |
| `S3_BUCKET` | empty | Bucket name. |
| `S3_ACCESS_KEY_ID` | empty | Access key. |
| `S3_SECRET_ACCESS_KEY` | empty | Secret key. |
| `S3_REGION` | `auto` | `auto` for R2; the real region for AWS. |
| `S3_SERVER_SIDE_ENCRYPTION` | empty | Optional. Leave empty for R2 or buckets with default encryption; set `AES256` for explicit AWS SSE-S3. |

Recommended R2 setup:

1. Create a private bucket.
2. Create an S3 API token scoped to that bucket with object read/write/delete.
3. Set the six `S3_*` values above.
4. Keep the bucket private. The app serves files through authenticated API
   routes; do not add a public bucket policy.

Production validation refuses to start with `STORAGE_BACKEND=s3` until a
bucket and access key are set.

## Uploads, logging, hosting

| Variable | Default | Notes |
| --- | --- | --- |
| `MAX_UPLOAD_MB` | `20` | Upload size cap (AI documents). The importer has its own 5 MB cap. |
| `MAX_IMPORT_ROWS` | `5000` | Rows accepted in one import. |
| `LOG_LEVEL` | `INFO` | Structured JSON logs to stdout. |
| `SENTRY_DSN` | empty | Reserved for error reporting; not wired to an SDK. |
| `FRONTEND_DIST_DIR` | empty | Point at a built Vite `dist` directory to serve the SPA from FastAPI (used by the Docker image). Leave empty when using Vite or Vercel. |
| `PORT` | `8000` | Read by the container command (not by the app itself). |

## Production checklist

Production startup fails fast, and logs `configuration_problem`, when any of
these are wrong:

- `SECRET_KEY` starts with `dev-` or is shorter than 32 characters
- `DATABASE_URL` is not PostgreSQL
- `COOKIE_SECURE` is not `true`
- `EXPOSE_RESET_TOKEN` is `true`
- AI is enabled without a base URL, or `openai` without an API key
- Resend is enabled without an API key
- S3 storage is selected without a bucket and access key

Also verify before launch:

- `FRONTEND_URL` and `ALLOWED_ORIGINS` use the real HTTPS origin
- The worker process is running (otherwise jobs stay queued)
- `/api/v1/health` returns 200 through the proxy
- Database backups are enabled
- The demo seed account is removed or its password changed
- TLS terminates at the proxy and forwards `X-Forwarded-*`
