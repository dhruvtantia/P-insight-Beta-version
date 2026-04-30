"""
Central feature registry.

This is the first implementation of P-Insight's internal feature contract
boundary. It gives the frontend and optional backend modules one stable place
to discover whether a feature is attached, degraded, or intentionally disabled.
"""

from fastapi import HTTPException

from app.core.config import settings
from app.schemas.system import FeatureDependencyHealth, FeatureHealth, FeatureRegistryResponse


def _dep(name: str, status: str, reason: str | None = None) -> FeatureDependencyHealth:
    return FeatureDependencyHealth(name=name, status=status, reason=reason)  # type: ignore[arg-type]


def _feature(
    *,
    feature_id: str,
    label: str,
    route_prefix: str,
    enabled: bool,
    dependencies: list[FeatureDependencyHealth] | None = None,
    side_effects: list[str] | None = None,
    failure_behavior: str,
    frontend_owner_hook: str | None,
    disable_behavior: str,
    disabled_reason: str | None = None,
) -> FeatureHealth:
    deps = dependencies or []
    if not enabled:
        status = "disabled"
        reason = disabled_reason or f"{feature_id} is disabled by feature flag."
    elif any(d.status == "unavailable" for d in deps):
        status = "unavailable"
        reason = "One or more required dependencies are unavailable."
    elif any(d.status in {"disabled", "degraded"} for d in deps):
        status = "degraded"
        reason = "One or more optional dependencies are disabled or degraded."
    else:
        status = "enabled"
        reason = None

    return FeatureHealth(
        feature_id=feature_id,
        label=label,
        status=status,  # type: ignore[arg-type]
        route_prefix=route_prefix,
        reason=reason,
        dependencies=deps,
        side_effects=side_effects or [],
        failure_behavior=failure_behavior,
        frontend_owner_hook=frontend_owner_hook,
        disable_behavior=disable_behavior,
    )


def get_feature_registry() -> FeatureRegistryResponse:
    """Return the current internal feature registry."""
    try:
        from app.data_providers.live_provider import YFINANCE_AVAILABLE
    except Exception:
        YFINANCE_AVAILABLE = False

    live_dep = _dep(
        "yfinance",
        "enabled" if YFINANCE_AVAILABLE and settings.LIVE_API_ENABLED else "degraded",
        None if YFINANCE_AVAILABLE and settings.LIVE_API_ENABLED else "Live market data is disabled or yfinance is unavailable.",
    )

    ai_dep = _dep(
        "llm_provider",
        "enabled" if (settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY) else "degraded",
        None if (settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY) else "No LLM provider key is configured; rule-based fallback may be used.",
    )

    features = [
        _feature(
            feature_id="portfolio_core",
            label="Portfolio Core",
            route_prefix="/api/v1/portfolio",
            enabled=settings.FEATURE_PORTFOLIO_CORE,
            failure_behavior="Core feature. If unavailable, dependent features should show empty/setup states.",
            frontend_owner_hook="usePortfolio",
            disable_behavior="Show portfolio setup/upload call to action.",
        ),
        _feature(
            feature_id="upload_import",
            label="Upload & Import",
            route_prefix="/api/v1/upload",
            enabled=settings.FEATURE_UPLOAD,
            side_effects=["creates portfolios", "creates holdings", "schedules enrichment", "schedules history build"],
            failure_behavior="Parsing failures do not write data; confirm failures must not affect existing portfolios.",
            frontend_owner_hook="useUploadWorkflow",
            disable_behavior="Hide upload actions and show disabled feature message.",
        ),
        _feature(
            feature_id="watchlist",
            label="Watchlist",
            route_prefix="/api/v1/watchlist",
            enabled=settings.FEATURE_WATCHLIST,
            failure_behavior="Watchlist failure must not affect portfolio core.",
            frontend_owner_hook="useWatchlist",
            disable_behavior="Hide watchlist navigation and entry points.",
        ),
        _feature(
            feature_id="risk_quant",
            label="Risk & Quant Analytics",
            route_prefix="/api/v1/quant",
            enabled=settings.FEATURE_QUANT,
            dependencies=[live_dep],
            failure_behavior="Risk page degrades; dashboard still renders portfolio core.",
            frontend_owner_hook="useQuantAnalytics",
            disable_behavior="Hide or mark risk/optimization views as unavailable.",
        ),
        _feature(
            feature_id="fundamentals",
            label="Fundamentals",
            route_prefix="/api/v1/analytics/ratios",
            enabled=settings.FEATURE_FUNDAMENTALS,
            dependencies=[live_dep],
            failure_behavior="Fundamental tables show unavailable metrics without affecting portfolio core.",
            frontend_owner_hook="useFundamentals",
            disable_behavior="Hide fundamentals navigation and panels.",
        ),
        _feature(
            feature_id="history",
            label="Snapshots & History",
            route_prefix="/api/v1/history",
            enabled=settings.FEATURE_HISTORY,
            dependencies=[live_dep],
            side_effects=["writes portfolio_history", "writes benchmark_history"],
            failure_behavior="History charts show building/unavailable state; portfolio core remains usable.",
            frontend_owner_hook="usePortfolioHistory",
            disable_behavior="Hide changes/history views.",
        ),
        _feature(
            feature_id="market_data",
            label="Market Data",
            route_prefix="/api/v1/market",
            enabled=settings.FEATURE_MARKET_DATA,
            dependencies=[live_dep],
            failure_behavior="Market page shows degraded/unavailable state; no portfolio impact.",
            frontend_owner_hook="useIndices",
            disable_behavior="Hide market navigation and ticker strip.",
        ),
        _feature(
            feature_id="news",
            label="News & Events",
            route_prefix="/api/v1/news",
            enabled=settings.FEATURE_NEWS,
            dependencies=[
                _dep(
                    "news_api",
                    "enabled" if settings.NEWS_API_KEY else "degraded",
                    None if settings.NEWS_API_KEY else "NEWS_API_KEY is not configured; only empty/fallback responses are available.",
                )
            ],
            failure_behavior="News panels show empty/unavailable states; portfolio core remains usable.",
            frontend_owner_hook="useNews",
            disable_behavior="Hide news navigation and event panels.",
        ),
        _feature(
            feature_id="advisor",
            label="AI Advisor",
            route_prefix="/api/v1/advisor",
            enabled=settings.FEATURE_ADVISOR,
            dependencies=[ai_dep],
            failure_behavior="Advisor returns fallback/degraded response; portfolio core remains usable.",
            frontend_owner_hook="useAdvisor",
            disable_behavior="Hide advisor navigation and assistant panels.",
        ),
        _feature(
            feature_id="broker_sync",
            label="Broker Sync",
            route_prefix="/api/v1/brokers",
            enabled=settings.FEATURE_BROKER_SYNC and settings.BROKER_SYNC_ENABLED,
            disabled_reason="Broker sync is scaffolded and disabled until credentials and connector flows are production-ready.",
            side_effects=["creates broker connection records", "can replace holdings when implemented"],
            failure_behavior="Broker failures must not affect uploaded/manual portfolio workflows.",
            frontend_owner_hook="useBrokerConnections",
            disable_behavior="Hide broker sync navigation and connection actions.",
        ),
    ]

    return FeatureRegistryResponse(features=features)


def get_feature(feature_id: str) -> FeatureHealth | None:
    for feature in get_feature_registry().features:
        if feature.feature_id == feature_id:
            return feature
    return None


def require_feature(feature_id: str) -> FeatureHealth:
    """Raise a typed 503 if a feature is disconnected."""
    feature = get_feature(feature_id)
    if feature is None:
        raise HTTPException(
            status_code=503,
            detail={
                "feature_id": feature_id,
                "status": "unavailable",
                "reason": "Feature is not registered.",
            },
        )
    if feature.status == "disabled":
        raise HTTPException(
            status_code=503,
            detail={
                "feature_id": feature.feature_id,
                "status": feature.status,
                "reason": feature.reason,
                "disable_behavior": feature.disable_behavior,
            },
        )
    return feature
