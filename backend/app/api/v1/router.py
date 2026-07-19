"""
API v1 Router
--------------
Aggregates all endpoint routers under the /api/v1 prefix.
To add a new module, import its router and include it here.
"""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.api.v1.endpoints import (
    portfolio,
    analytics,
    watchlist,
    peers,
    news,
    frontier,
    ai_chat,
    advisor,
    live,
    market,
    quant,
    optimization,
    upload,
    portfolios_mgmt,
    snapshots,
    brokers,
    history,
    system,
)

# Global auth gate: when AUTH_ENABLED, get_current_user requires a valid
# Supabase token on every /api/v1 route (defense-in-depth on top of per-service
# user scoping). When AUTH_ENABLED is off it is a no-op, preserving single-user
# local/dev behavior. health/readiness live on the app root, outside this gate.
api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(get_current_user)])

api_router.include_router(market.router)       # market data (gated with the rest when auth on)
api_router.include_router(portfolio.router)
api_router.include_router(analytics.router)
api_router.include_router(watchlist.router)
api_router.include_router(peers.router)
api_router.include_router(news.router)
api_router.include_router(frontier.router)
api_router.include_router(ai_chat.router)
api_router.include_router(advisor.router)
api_router.include_router(live.router)
api_router.include_router(quant.router)
api_router.include_router(optimization.router)
api_router.include_router(upload.router)
api_router.include_router(portfolios_mgmt.router)
api_router.include_router(snapshots.router)
api_router.include_router(brokers.router)
api_router.include_router(history.router)   # portfolio daily history + holdings status
api_router.include_router(system.router)    # feature registry + system contracts
