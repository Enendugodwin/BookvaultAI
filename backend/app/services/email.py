from __future__ import annotations

import html as html_lib

import httpx

from app.core.config import settings
from app.core.logging import log_event

RESEND_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str, text: str | None = None) -> dict:
    """Send via Resend. Returns provider state; never claims success without an id."""
    if not settings.email_enabled:
        return {"status": "disabled", "provider_id": None, "error": "Email is not configured."}
    if settings.email_provider != "resend":
        return {"status": "failed", "provider_id": None, "error": "Unsupported email provider."}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text or html_lib.unescape(html),
                },
            )
        if resp.status_code in (200, 201, 202):
            body = resp.json()
            if body.get("id"):
                return {"status": "accepted", "provider_id": body["id"], "error": None}
            return {"status": "failed", "provider_id": None, "error": "Provider returned no message id."}
        detail = resp.text[:300]
        log_event("email_failed", level=30, status=resp.status_code, detail=detail)
        return {"status": "failed", "provider_id": None, "error": f"Provider HTTP {resp.status_code}"}
    except Exception as exc:  # network/timeout
        log_event("email_error", level=40, error=type(exc).__name__)
        return {"status": "failed", "provider_id": None, "error": f"{type(exc).__name__}"}


def report_html(title: str, intro: str, rows: list[tuple[str, str]], footer: str) -> str:
    rows_html = "".join(
        f"<tr><td style='padding:8px 12px;color:#5b5f6b'>{html_lib.escape(k)}</td>"
        f"<td style='padding:8px 12px;font-weight:600'>{html_lib.escape(str(v))}</td></tr>"
        for k, v in rows
    )
    return f"""<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:Georgia,serif;color:#1c1b19">
<div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e2db;border-radius:12px;overflow:hidden">
  <div style="padding:24px 28px;border-bottom:1px solid #eeeae2">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6d5bd0">YVO's Book Vault</div>
    <h1 style="font-size:24px;margin:8px 0 0">{html_lib.escape(title)}</h1>
  </div>
  <div style="padding:20px 28px">
    <p style="line-height:1.6;color:#444">{html_lib.escape(intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">{rows_html}</table>
    <p style="margin-top:24px;font-size:12px;color:#8a8577">{html_lib.escape(footer)}</p>
  </div>
</div></body></html>"""
