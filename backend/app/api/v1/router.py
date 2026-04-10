"""
API v1 Router
--------------
Aggregates all endpoint routers under the /api/v1 prefix.
To add a new module, import its router and include it here.
"""

from fastapi import APIRouter

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
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(market.router)       # market landing page data (no auth required)
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
