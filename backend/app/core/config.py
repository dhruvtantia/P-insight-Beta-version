"""
P-Insight Core Configuration
-----------------------------
Centralised settings loaded from environment variables (.env file).
All environment-specific values live here — never hard-coded elsewhere.

Quick-start defaults are safe for local development.
For production, set APP_ENV=production and override dangerous defaults
(DEBUG, ALLOWED_ORIGINS, DOCS_ENABLED) via environment variables or a
.env file.  See DEPLOYMENT.md for the full checklist.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ─── Application ─────────────────────────────────────────────────────────
    APP_NAME:    str  = "P-Insight API"
    APP_VERSION: str  = "0.1.0"

    # "development" | "staging" | "production"
    APP_ENV: str = "development"

    # Set False in production — True is only safe locally
    DEBUG: bool = False

    # ─── Logging ─────────────────────────────────────────────────────────────
    # "DEBUG" | "INFO" | "WARNING" | "ERROR"
    LOG_LEVEL: str = "INFO"

    # ─── API Docs ────────────────────────────────────────────────────────────
    # Disable Swagger UI + ReDoc in production to reduce attack surface.
    # Override with DOCS_ENABLED=true when you need them behind a VPN etc.
    DOCS_ENABLED: bool = False

    # ─── CORS ────────────────────────────────────────────────────────────────
    # Preferred: comma-separated list of allowed origins.
    #   ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
    # Fallback (single origin, kept for backwards-compat):
    #   FRONTEND_URL=http://localhost:3000
    # If ALLOWED_ORIGINS is non-empty it takes precedence over FRONTEND_URL.
    ALLOWED_ORIGINS: list[str] = []
    FRONTEND_URL:    str       = "http://localhost:3000"

    # ─── Database ────────────────────────────────────────────────────────────
    # SQLite (default — no setup required):
    #   DATABASE_URL=sqlite:///./p_insight.db
    # PostgreSQL (production):
    #   DATABASE_URL=postgresql+psycopg2://user:password@host:5432/p_insight
    #   pip install psycopg2-binary   (or asyncpg for async drivers)
    #   Then run: alembic upgrade head
    DATABASE_URL: str = "sqlite:///./p_insight.db"

    # ─── Data Mode ───────────────────────────────────────────────────────────
    # Stored as a plain str so that a stale .env value (e.g. "mock") never causes
    # a pydantic ValidationError that crashes the entire backend on startup.
    # The routing layer (core/dependencies.py) enforces the valid values at request
    # time and returns a 400 error for anything unsupported.
    DEFAULT_DATA_MODE: str = "uploaded"

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

    # ─── External API Keys (all optional) ────────────────────────────────────
    ALPHA_VANTAGE_API_KEY:          str = ""
    FINANCIAL_MODELING_PREP_API_KEY: str = ""
    NEWS_API_KEY:                   str = ""
    OPENAI_API_KEY:                 str = ""
    ANTHROPIC_API_KEY:              str = ""
    ZERODHA_API_KEY:                str = ""
    ZERODHA_API_SECRET:             str = ""

    class Config:
        env_file      = ".env"
        case_sensitive = True
        extra          = "ignore"

    # ─── Derived helpers ──────────────────────────────────────────────────────

    def cors_origins(self) -> list[str]:
        """
        Return the effective CORS allow-list.
        ALLOWED_ORIGINS (multi-value) takes precedence over FRONTEND_URL.
        In development mode, localhost:3000 is always included as a convenience.
        """
        if self.ALLOWED_ORIGINS:
            origins = list(self.ALLOWED_ORIGINS)
        else:
            origins = [self.FRONTEND_URL]

        # Always allow localhost in non-production environments
        if self.APP_ENV != "production" and "http://localhost:3000" not in origins:
            origins.append("http://localhost:3000")

        return origins

    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


# Single shared instance — import this everywhere
settings = Settings()
