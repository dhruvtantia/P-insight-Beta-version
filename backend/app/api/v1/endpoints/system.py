"""
System contract endpoints.
"""

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.system import FeatureRegistryResponse
from app.services.feature_registry import get_feature_registry

router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/features",
    response_model=FeatureRegistryResponse,
    summary="Get modular feature registry and health contract",
)
async def get_features() -> FeatureRegistryResponse:
    return get_feature_registry()


@router.get("/diagnostics", summary="Local development diagnostics only")
async def get_diagnostics():
    # No operator-role model exists yet. Do not expose inventory to remote users.
    if settings.APP_ENV not in {"development", "test"}:
        raise HTTPException(status_code=404, detail="Not found")
    from app.data_providers.live_provider import YFINANCE_AVAILABLE

    return {
        "status": "healthy", "app": settings.APP_NAME,
        "version": settings.APP_VERSION, "env": settings.APP_ENV,
        "features": {
            "live_api": settings.LIVE_API_ENABLED,
            "broker_sync": settings.BROKER_SYNC_ENABLED,
            "ai_chat": settings.AI_CHAT_ENABLED,
            "yfinance": YFINANCE_AVAILABLE,
        },
        "api_keys": {
            "anthropic": bool(settings.ANTHROPIC_API_KEY),
            "openai": bool(settings.OPENAI_API_KEY),
            "news_api": bool(settings.NEWS_API_KEY),
            "alpha_vantage": bool(settings.ALPHA_VANTAGE_API_KEY),
            "fmp": bool(settings.FINANCIAL_MODELING_PREP_API_KEY),
            "zerodha": bool(settings.ZERODHA_API_KEY),
        },
    }
