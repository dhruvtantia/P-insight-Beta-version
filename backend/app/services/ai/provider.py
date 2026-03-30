"""
LLM Provider Abstraction
--------------------------
Provider-agnostic interface for calling language models.

Architecture:
  LLMProvider (ABC)
    ├── ClaudeProvider   — uses `anthropic` SDK (soft-import, optional)
    ├── OpenAIProvider   — uses `openai` SDK   (soft-import, optional)
    └── FallbackProvider — no-op; signals frontend to use rule-based advisor

To add a new provider:
  1. Subclass LLMProvider
  2. Implement complete(system_prompt, user_message) → str
  3. Add detection logic in get_provider()

Soft-import pattern:
  The SDK packages are imported INSIDE the class method, not at module level.
  This means the server starts cleanly even if neither package is installed.
  Missing packages are caught gracefully and fall through to FallbackProvider.

Credential handling:
  API keys come from app.core.config.settings — never hardcoded, never in DB.
  Models:
    Claude  → claude-3-5-haiku-20241022  (fast, good for advisory)
    OpenAI  → gpt-4o-mini               (cost-effective default)
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Default model identifiers — changeable without code edits by subclassing
CLAUDE_MODEL  = "claude-3-5-haiku-20241022"
OPENAI_MODEL  = "gpt-4o-mini"
MAX_TOKENS    = 1024


# ─── Base class ───────────────────────────────────────────────────────────────

class LLMProvider(ABC):
    """
    Abstract base for all LLM providers.
    Each provider must implement `complete()` and `get_info()`.
    """

    @abstractmethod
    def complete(self, system_prompt: str, user_message: str) -> str:
        """
        Send a system prompt + user message to the model.
        Returns the model's raw text reply.
        Raises ProviderError on failure.
        """
        ...

    @abstractmethod
    def get_info(self) -> dict:
        """Return provider metadata: name, model, available."""
        ...


class ProviderError(Exception):
    """Raised when the LLM provider call fails."""


# ─── Claude (Anthropic) ───────────────────────────────────────────────────────

class ClaudeProvider(LLMProvider):
    """
    Calls Anthropic's Claude API using the `anthropic` SDK.

    Requirements:
      - `anthropic` package installed (poetry add anthropic)
      - ANTHROPIC_API_KEY set in .env

    Model: claude-3-5-haiku-20241022 (fast, cost-efficient for portfolio Q&A)
    """

    def __init__(self, api_key: str, model: str = CLAUDE_MODEL):
        self.api_key = api_key
        self.model   = model

    def complete(self, system_prompt: str, user_message: str) -> str:
        try:
            import anthropic  # soft-import
        except ImportError as e:
            raise ProviderError(
                "anthropic package not installed. Run: poetry add anthropic"
            ) from e

        client = anthropic.Anthropic(api_key=self.api_key)
        try:
            msg = client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return msg.content[0].text
        except Exception as e:
            raise ProviderError(f"Claude API call failed: {e}") from e

    def get_info(self) -> dict:
        return {"provider": "claude", "model": self.model, "available": True}


# ─── OpenAI ───────────────────────────────────────────────────────────────────

class OpenAIProvider(LLMProvider):
    """
    Calls OpenAI's Chat Completions API using the `openai` SDK.

    Requirements:
      - `openai` package installed (poetry add openai)
      - OPENAI_API_KEY set in .env

    Model: gpt-4o-mini (affordable, capable default)
    """

    def __init__(self, api_key: str, model: str = OPENAI_MODEL):
        self.api_key = api_key
        self.model   = model

    def complete(self, system_prompt: str, user_message: str) -> str:
        try:
            from openai import OpenAI  # soft-import
        except ImportError as e:
            raise ProviderError(
                "openai package not installed. Run: poetry add openai"
            ) from e

        client = OpenAI(api_key=self.api_key)
        try:
            resp = client.chat.completions.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                messages=[
                    {"role": "system",  "content": system_prompt},
                    {"role": "user",    "content": user_message},
                ],
                response_format={"type": "json_object"},
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            raise ProviderError(f"OpenAI API call failed: {e}") from e

    def get_info(self) -> dict:
        return {"provider": "openai", "model": self.model, "available": True}


# ─── Fallback (no-op) ─────────────────────────────────────────────────────────

class FallbackProvider(LLMProvider):
    """
    Used when no AI provider is configured.
    Returns a JSON signal that the frontend interprets as "use rule-based fallback".
    """

    def __init__(self, reason: str = "No API key configured"):
        self.reason = reason

    def complete(self, system_prompt: str, user_message: str) -> str:
        # Return valid JSON so the parsing pipeline doesn't break
        return json.dumps({
            "summary":         "",
            "insights":        [],
            "recommendations": [],
            "follow_ups":      [],
            "_fallback":       True,
            "_reason":         self.reason,
        })

    def get_info(self) -> dict:
        return {"provider": "none", "model": None, "available": False}


# ─── Factory ──────────────────────────────────────────────────────────────────

def get_provider() -> LLMProvider:
    """
    Return the best available LLM provider.

    Priority:
      1. Claude (ANTHROPIC_API_KEY)
      2. OpenAI (OPENAI_API_KEY)
      3. FallbackProvider (always succeeds, signals frontend to use rule-based)

    The soft-import check happens inside each provider's complete() method,
    so provider selection here is purely about available API keys.
    """
    if settings.ANTHROPIC_API_KEY:
        logger.info("Using Claude provider (%s)", CLAUDE_MODEL)
        return ClaudeProvider(api_key=settings.ANTHROPIC_API_KEY)

    if settings.OPENAI_API_KEY:
        logger.info("Using OpenAI provider (%s)", OPENAI_MODEL)
        return OpenAIProvider(api_key=settings.OPENAI_API_KEY)

    logger.info("No AI provider configured — returning FallbackProvider")
    return FallbackProvider(reason="No ANTHROPIC_API_KEY or OPENAI_API_KEY in settings")


def get_provider_status() -> dict:
    """
    Return provider status without instantiating a full provider object.
    Used by GET /advisor/status.
    """
    if settings.ANTHROPIC_API_KEY:
        return {
            "available":  True,
            "provider":   "claude",
            "model":      CLAUDE_MODEL,
            "message":    "Claude provider configured via ANTHROPIC_API_KEY",
            "ai_enabled": True,
        }
    if settings.OPENAI_API_KEY:
        return {
            "available":  True,
            "provider":   "openai",
            "model":      OPENAI_MODEL,
            "message":    "OpenAI provider configured via OPENAI_API_KEY",
            "ai_enabled": True,
        }
    return {
        "available":  False,
        "provider":   "none",
        "model":      None,
        "message":    "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env to enable AI responses.",
        "ai_enabled": False,
    }
