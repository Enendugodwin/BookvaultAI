from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from app.core.config import Settings, settings
from app.core.errors import AIUnavailable


@dataclass
class AIResult:
    content: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class BaseProvider:
    name = "base"
    model: str | None = None

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 900) -> AIResult:
        raise NotImplementedError


class DisabledProvider(BaseProvider):
    name = "disabled"

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 900) -> AIResult:
        raise AIUnavailable(
            "AI features are turned off. Add a provider configuration to enable the assistant."
        )


class OpenAICompatibleProvider(BaseProvider):
    name = "openai"

    def __init__(self, cfg: Settings) -> None:
        self.cfg = cfg
        self.model = cfg.ai_model
        self.url = cfg.ai_base_url.rstrip("/") + "/chat/completions"

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 900) -> AIResult:
        if not self.cfg.ai_api_key:
            raise AIUnavailable("The AI provider API key is not configured.")
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }
        headers = {"Authorization": f"Bearer {self.cfg.ai_api_key}"}
        last_error = "AI provider request failed."
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=self.cfg.ai_timeout_seconds) as client:
                    resp = await client.post(self.url, json=payload, headers=headers)
                if resp.status_code in (401, 403):
                    raise AIUnavailable("The AI provider rejected the configured credentials.")
                if resp.status_code == 429:
                    last_error = "The AI provider is rate limiting requests."
                    await asyncio.sleep(1 + attempt)
                    continue
                if resp.status_code >= 500:
                    last_error = "The AI provider is temporarily unavailable."
                    await asyncio.sleep(1 + attempt)
                    continue
                resp.raise_for_status()
                body = resp.json()
                content = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
                if not content.strip():
                    raise AIUnavailable("The AI provider returned an empty response.")
                usage = body.get("usage") or {}
                return AIResult(
                    content=content.strip(),
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"),
                )
            except AIUnavailable:
                raise
            except httpx.TimeoutException:
                last_error = "The AI provider timed out."
            except Exception as exc:
                last_error = f"AI provider error ({type(exc).__name__})."
        raise AIUnavailable(last_error)


class OllamaProvider(BaseProvider):
    name = "ollama"

    def __init__(self, cfg: Settings) -> None:
        self.cfg = cfg
        self.model = cfg.ai_model
        self.url = cfg.ai_base_url.rstrip("/") + "/api/chat"

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 900) -> AIResult:
        if not self.cfg.ai_base_url:
            raise AIUnavailable("The Ollama endpoint is not configured.")
        payload = {
            "model": self.model,
            "stream": False,
            "messages": [{"role": "system", "content": system}, *messages],
            "options": {"temperature": 0.3, "num_predict": max_tokens},
        }
        try:
            async with httpx.AsyncClient(timeout=self.cfg.ai_timeout_seconds) as client:
                resp = await client.post(self.url, json=payload)
            if resp.status_code in (401, 403):
                raise AIUnavailable("The Ollama endpoint rejected the configured credentials.")
            resp.raise_for_status()
            body = resp.json()
            content = (body.get("message") or {}).get("content") or ""
            if not content.strip():
                raise AIUnavailable("The AI provider returned an empty response.")
            return AIResult(
                content=content.strip(),
                prompt_tokens=body.get("prompt_eval_count"),
                completion_tokens=body.get("eval_count"),
            )
        except AIUnavailable:
            raise
        except httpx.TimeoutException:
            raise AIUnavailable("The Ollama endpoint timed out.")
        except Exception as exc:
            raise AIUnavailable(f"Ollama request failed ({type(exc).__name__}).")


def get_provider(cfg: Settings | None = None) -> BaseProvider:
    cfg = cfg or settings
    if cfg.ai_provider == "openai":
        return OpenAICompatibleProvider(cfg)
    if cfg.ai_provider == "ollama":
        return OllamaProvider(cfg)
    return DisabledProvider()
