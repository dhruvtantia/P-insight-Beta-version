"""
P-Insight Core Configuration
-----------------------------
Centralised settings loaded from environment variables (.env file).
All environment-specific values live here — never hard-coded elsewhere.

See docs/RUNTIME_SAFETY.md for local bootstrap and managed deployment policy.
"""

import ipaddress
import json
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, TypeAdapter, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

_HTTP_URL = TypeAdapter(AnyHttpUrl)


def _origin(value: str, *, deployed: bool = False) -> str:
    """Validate a browser origin, not an arbitrary URL or CORS pattern."""
    try:
        parsed = urlsplit(value)
        # Pydantic normalizes browser-style numeric hosts (e.g. 127.1) too.
        canonical = urlsplit(str(_HTTP_URL.validate_python(value)))
        host = canonical.hostname
        port = parsed.port
        if (
            not host or parsed.scheme not in {"http", "https"}
            or parsed.username is not None or parsed.password is not None
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment
            or "?" in value or "#" in value or "*" in value or "\\" in value
            or any(char.isspace() or ord(char) < 32 for char in value)
        ):
            raise ValueError
        if deployed:
            local_host = host.rstrip(".")
            if parsed.scheme != "https" or local_host == "localhost" or local_host.endswith(".localhost"):
                raise ValueError
            try:
                address = ipaddress.ip_address(host)
            except ValueError:
                address = None
            if address is not None and (address.is_loopback or address.is_unspecified):
                raise ValueError
        authority = f"[{host}]" if ":" in host else host
        if port is not None and port != (443 if parsed.scheme == "https" else 80):
            authority += f":{port}"
        return f"{parsed.scheme}://{authority}"
    except (TypeError, ValueError):
        raise ValueError("Expected an exact HTTP(S) origin without credentials, path or wildcards") from None


class Settings(BaseSettings):
    # ─── Application ─────────────────────────────────────────────────────────
    APP_NAME:    str  = "P-Insight API"
    APP_VERSION: str  = "0.1.0"

    # Unknown environment names fail closed instead of falling back to local behavior.
    APP_ENV: Literal["development", "test", "staging", "production"] = "development"

    # Set False in production — True is only safe locally
    DEBUG: bool = False

    # ─── Logging ─────────────────────────────────────────────────────────────
    # "DEBUG" | "INFO" | "WARNING" | "ERROR"
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # ─── API Docs ────────────────────────────────────────────────────────────
    # Disable Swagger UI + ReDoc in production to reduce attack surface.
    # Only development/test may expose docs or the raw OpenAPI schema.
    DOCS_ENABLED: bool = False

    # ─── CORS ────────────────────────────────────────────────────────────────
    # Preferred: comma-separated list of allowed origins.
    #   ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
    # Fallback (single origin, kept for backwards-compat):
    #   FRONTEND_URL=http://localhost:3000
    # If ALLOWED_ORIGINS is non-empty it takes precedence over FRONTEND_URL.
    ALLOWED_ORIGINS: Annotated[list[str], NoDecode] = []
    FRONTEND_URL:    str       = "http://localhost:3000"

    # ─── Database ────────────────────────────────────────────────────────────
    # SQLite (default — no setup required):
    #   DATABASE_URL=sqlite:///./p_insight.db
    # PostgreSQL (production):
    #   DATABASE_URL=postgresql+psycopg2://user:password@host:5432/p_insight
    #   Use the locked sync driver, then run: alembic upgrade head
    DATABASE_URL: str = "sqlite:///./p_insight.db"
    # Explicit opt-in for disposable local SQLite only; never deployed DDL.
    LOCAL_DB_BOOTSTRAP: bool = False

    # ─── Authentication & Tenancy (Supabase Auth) ───────────────────────────
    # AUTH_ENABLED gates the whole tenancy layer. When False (local/dev/test
    # default), the app runs in legacy single-user mode: no token is required
    # and all data is global. When True, every /api/v1 route requires a valid
    # Supabase JWT and all portfolio/watchlist/broker data is scoped to the
    # authenticated user. Set True + provide the Supabase values in production.
    AUTH_ENABLED: bool = False

    # Supabase project reference — used to build the JWKS/issuer URLs and shown
    # to the frontend as NEXT_PUBLIC_SUPABASE_URL.
    SUPABASE_URL: str = ""

    # Optional legacy HS256 secret. ES256/RS256 use SUPABASE_URL + JWKS instead.
    # Never expose this value to the frontend.
    SUPABASE_JWT_SECRET: str = ""

    # Expected `aud` claim on Supabase access tokens (default "authenticated").
    SUPABASE_JWT_AUD: str = "authenticated"

    # ─── Data Mode ───────────────────────────────────────────────────────────
    # Invalid legacy values must fail at configuration time, not during requests.
    DEFAULT_DATA_MODE: Literal["uploaded", "live", "broker"] = "uploaded"

    # ─── Feature Flags ───────────────────────────────────────────────────────
    LIVE_API_ENABLED:          bool = True
    BROKER_SYNC_ENABLED:       bool = False
    AI_CHAT_ENABLED:           bool = False
    ADVANCED_ANALYTICS_ENABLED: bool = False

    # Modular feature switches. These are intentionally separate from provider
    # availability flags so a feature can be disconnected while the rest of the
    # application remains usable.
    FEATURE_PORTFOLIO_CORE: bool = True
    FEATURE_UPLOAD:         bool = True
    FEATURE_WATCHLIST:      bool = True
    FEATURE_QUANT:          bool = True
    FEATURE_FUNDAMENTALS:   bool = True
    FEATURE_HISTORY:        bool = True
    FEATURE_MARKET_DATA:    bool = True
    FEATURE_NEWS:           bool = True
    FEATURE_ADVISOR:        bool = True
    FEATURE_BROKER_SYNC:    bool = False
    FEATURE_AI_CHAT:        bool = False
    FEATURE_SCREENER:       bool = False
    FEATURE_LEGACY_FRONTIER: bool = False

    # ─── External API Keys (all optional) ────────────────────────────────────
    ALPHA_VANTAGE_API_KEY:          str = ""
    FINANCIAL_MODELING_PREP_API_KEY: str = ""
    NEWS_API_KEY:                   str = ""
    OPENAI_API_KEY:                 str = ""
    ANTHROPIC_API_KEY:              str = ""
    ZERODHA_API_KEY:                str = ""
    ZERODHA_API_SECRET:             str = ""

    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=True, extra="ignore", hide_input_in_errors=True,
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, value):
        if isinstance(value, str):
            if not value.strip():
                return []
            if value.lstrip().startswith("["):
                try:
                    value = json.loads(value)
                except ValueError:
                    raise ValueError("ALLOWED_ORIGINS must be a JSON list or comma-separated origins") from None
            else:
                value = [part.strip() for part in value.split(",")]
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValueError("ALLOWED_ORIGINS must be a list of origins")
        return list(dict.fromkeys(_origin(item) for item in value))

    @field_validator("FRONTEND_URL")
    @classmethod
    def validate_frontend_origin(cls, value):
        return _origin(value)

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value):
        try:
            url = make_url(value)
            if url.drivername not in {"sqlite", "sqlite+pysqlite", "postgresql", "postgresql+psycopg2"}:
                raise ValueError
            if url.get_backend_name() == "postgresql" and (not url.host or not url.database):
                raise ValueError
        except (ArgumentError, TypeError, ValueError):
            raise ValueError("DATABASE_URL must select supported synchronous SQLite or PostgreSQL") from None
        return value

    @model_validator(mode="after")
    def validate_runtime(self):
        deployed = self.APP_ENV in {"staging", "production"}
        errors = []
        if self.LOCAL_DB_BOOTSTRAP and (deployed or not self.is_sqlite()):
            errors.append("LOCAL_DB_BOOTSTRAP is restricted to development/test SQLite")
        if self.AUTH_ENABLED:
            if not self.SUPABASE_JWT_AUD or self.SUPABASE_JWT_AUD.strip() != self.SUPABASE_JWT_AUD:
                errors.append("SUPABASE_JWT_AUD must be non-empty without surrounding whitespace")
            try:
                _origin(self.SUPABASE_URL, deployed=deployed)
            except ValueError:
                errors.append("SUPABASE_URL must be an exact project origin (non-local HTTPS when deployed)")
        if deployed:
            if not self.AUTH_ENABLED:
                errors.append("AUTH_ENABLED must be true")
            if self.DEBUG or self.LOG_LEVEL == "DEBUG":
                errors.append("DEBUG and debug logging must be disabled")
            if self.DOCS_ENABLED:
                errors.append("DOCS_ENABLED must be false")
            if self.is_sqlite():
                errors.append("DATABASE_URL must select PostgreSQL")
            try:
                for origin in self.cors_origins():
                    _origin(origin, deployed=True)
            except ValueError:
                errors.append("CORS origins must be exact non-local HTTPS origins")
        if errors:
            raise ValueError("; ".join(errors))
        return self

    # ─── Derived helpers ──────────────────────────────────────────────────────

    def cors_origins(self) -> list[str]:
        """
        Return the effective CORS allow-list.
        ALLOWED_ORIGINS (multi-value) takes precedence over FRONTEND_URL.
        No localhost origins are appended implicitly.
        """
        if self.ALLOWED_ORIGINS:
            origins = list(self.ALLOWED_ORIGINS)
        else:
            origins = [self.FRONTEND_URL]

        return origins

    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


# Single shared instance — import this everywhere
settings = Settings()
