"""
P-Insight Core Configuration
-----------------------------
Centralised settings loaded from environment variables (.env file).
All environment-specific values live here — never hard-coded elsewhere.
Add new config values here as features are added.
"""

from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # ─── Application ─────────────────────────────────────────────────────────
    APP_NAME: str = "P-Insight API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # ─── CORS ────────────────────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"

    # ─── Database ────────────────────────────────────────────────────────────
    # SQLite by default. To switch to PostgreSQL later:
    #   1. Change this to: postgresql+asyncpg://user:pass@host/dbname
    #   2. poetry add asyncpg
    #   3. Update engine in db/database.py (remove check_same_thread arg)
    DATABASE_URL: str = "sqlite:///./p_insight.db"

    # ─── Data Mode ───────────────────────────────────────────────────────────
    DEFAULT_DATA_MODE: Literal["mock", "uploaded", "live", "broker"] = "mock"

    # ─── Feature Flags ───────────────────────────────────────────────────────
    # Phase 2: Live API is now enabled — requires `poetry add yfinance httpx`
    LIVE_API_ENABLED: bool = True
    BROKER_SYNC_ENABLED: bool = False
    AI_CHAT_ENABLED: bool = False
    ADVANCED_ANALYTICS_ENABLED: bool = False

    # ─── External API Keys (all optional for Phase 1) ────────────────────────
    ALPHA_VANTAGE_API_KEY: str = ""
    FINANCIAL_MODELING_PREP_API_KEY: str = ""
    NEWS_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    ZERODHA_API_KEY: str = ""
    ZERODHA_API_SECRET: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


# Single shared instance — import this everywhere
settings = Settings()
