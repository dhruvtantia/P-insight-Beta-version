"""
FastAPI Dependency Injection
-----------------------------
Shared dependencies injected into route handlers via FastAPI's Depends() system.
Add new shared dependencies here (auth, rate limiting, etc.) without touching routes.
"""

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Annotated, Literal

from app.db.database import get_db
from app.core.config import settings
from app.data_providers.base import BaseDataProvider
from app.data_providers.mock_provider import MockDataProvider
from app.data_providers.file_provider import FileDataProvider
from app.data_providers.live_provider import LiveAPIProvider
from app.data_providers.broker_provider import BrokerSyncProvider


# ─── Database Session ─────────────────────────────────────────────────────────

DbSession = Annotated[Session, Depends(get_db)]


# ─── Data Provider Factory ────────────────────────────────────────────────────

DataMode = Literal["mock", "uploaded", "live", "broker"]


def get_data_provider(
    db:   Annotated[Session, Depends(get_db)],
    mode: DataMode = Query(default="mock", description="Data source mode"),
) -> BaseDataProvider:
    """
    Returns the appropriate data provider based on the requested mode.
    This is the central switching mechanism for the Data Mode toggle.

    LiveAPIProvider receives the current db session so it can load the active
    portfolio's holdings directly from the database instead of mock_data/.

    To add a new provider:
      1. Create a new class in data_providers/ implementing BaseDataProvider
      2. Add a new case here
    """
    providers: dict[str, BaseDataProvider] = {
        "mock":     MockDataProvider(),
        "uploaded": FileDataProvider(),
        "live":     LiveAPIProvider(db=db),   # db-backed live holdings
        "broker":   BrokerSyncProvider(),
    }

    provider = providers.get(mode)

    if provider is None:
        raise HTTPException(status_code=400, detail=f"Unknown data mode: {mode}")

    if not provider.is_available:
        detail = getattr(provider, 'unavailable_reason', None)
        if not detail:
            detail = f"Data mode '{mode}' is not currently enabled. Check feature flags in settings."
        raise HTTPException(status_code=503, detail=detail)

    return provider


DataProvider = Annotated[BaseDataProvider, Depends(get_data_provider)]
