"""
FastAPI Dependency Injection
-----------------------------
Shared dependencies injected into route handlers via FastAPI's Depends() system.
Add new shared dependencies here (auth, rate limiting, etc.) without touching routes.
"""

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Annotated, Literal, Optional

from app.db.database import get_db
from app.core.auth import get_current_user_id
from app.data_providers.base import BaseDataProvider
from app.data_providers.uploaded_provider import UploadedPortfolioProvider
from app.data_providers.live_provider import LiveAPIProvider
from app.data_providers.broker_provider import BrokerSyncProvider


# ─── Database Session ─────────────────────────────────────────────────────────

DbSession = Annotated[Session, Depends(get_db)]


# ─── Current User (tenancy) ───────────────────────────────────────────────────
# Resolves to the authenticated user's internal id, or None in legacy mode
# (AUTH_ENABLED off). Endpoints pass this into services so all portfolio /
# watchlist / broker reads and writes are scoped to the current user.
CurrentUserId = Annotated[Optional[int], Depends(get_current_user_id)]


# ─── Data Provider Factory ────────────────────────────────────────────────────

# "mock" mode is intentionally removed — mock data is disabled in this build.
# Supported modes: uploaded (CSV/Excel portfolio), live (yfinance), broker (future).
DataMode = Literal["uploaded", "live", "broker"]


def get_data_provider(
    db:      Annotated[Session, Depends(get_db)],
    user_id: Annotated[Optional[int], Depends(get_current_user_id)] = None,
    mode:    DataMode = Query(default="uploaded", description="Data source mode"),
) -> BaseDataProvider:
    """
    Returns the appropriate data provider based on the requested mode.
    This is the central switching mechanism for the Data Mode toggle.

    LiveAPIProvider receives the current db session so it can load the active
    portfolio's holdings directly from the database instead of mock_data/.

    Mock mode has been intentionally disabled. The application requires a real
    uploaded or broker-synced portfolio.

    To add a new provider:
      1. Create a new class in data_providers/ implementing BaseDataProvider
      2. Add a new case here
    """
    if mode == "mock":
        raise HTTPException(
            status_code=400,
            detail="Mock data mode is disabled. Please upload a portfolio CSV or connect a broker account.",
        )

    providers: dict[str, BaseDataProvider] = {
        "uploaded": UploadedPortfolioProvider(db=db, user_id=user_id),
        "live":     LiveAPIProvider(db=db, user_id=user_id),   # db-backed live holdings
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
