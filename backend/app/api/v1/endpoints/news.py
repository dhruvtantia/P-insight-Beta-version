"""
News & Events API Endpoints — Phase 1 (Scaffold)
-------------------------------------------------
Returns financial news and upcoming corporate events relevant to portfolio holdings.

Endpoints:
  GET /api/v1/news/
    ?mode=mock|uploaded|live
    &tickers=TCS.NS,INFY.NS     (optional; comma-separated)
    &event_type=earnings        (optional; one of the EVENT_TYPES list below)

  GET /api/v1/news/events
    ?mode=mock|uploaded|live
    &tickers=TCS.NS,INFY.NS     (optional)
    &event_type=earnings        (optional)

Live mode behaviour:
  LiveAPIProvider.get_news()   → always returns []  (no NewsAPI key configured)
  LiveAPIProvider.get_events() → always returns []  (no corporate calendar API)
  Responses include live_unavailable=True so the UI can display an explicit
  "No news source configured for live mode" message rather than a generic empty state.

Phase 2: Wire a NewsAPI / Bloomberg / yfinance.news key to LiveAPIProvider.get_news().
"""

from fastapi import APIRouter, Query
from typing import Optional

from app.core.dependencies import DataProvider

router = APIRouter(prefix="/news", tags=["News & Events"])

# Supported event types — validated client-side; backend passes through any value
EVENT_TYPES = [
    "earnings",
    "dividend",
    "deal",
    "rating",
    "company_update",
    "market_event",
    "regulatory",
    "management",
]


@router.get("/", summary="Get portfolio-relevant news")
async def get_news(
    provider: DataProvider,
    tickers: Optional[str] = Query(
        None,
        description="Comma-separated ticker list to filter articles (e.g. TCS.NS,INFY.NS). "
                    "If omitted, all portfolio holdings are used.",
    ),
    event_type: Optional[str] = Query(
        None,
        description=f"Filter by event type. One of: {', '.join(EVENT_TYPES)}",
    ),
):
    """
    Return recent news articles relevant to portfolio holdings.

    - If tickers is provided, only articles matching at least one of those
      tickers are returned.
    - If tickers is omitted, all holdings are fetched and used as the filter.
    - event_type further narrows the result set.

    Phase 1: Served from mock_data/portfolio.json (static).
    Phase 2: Fetched from live news API by ticker.
    """
    # Resolve ticker list
    if tickers:
        ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    else:
        # Fall back to all holdings from the active provider
        holdings = await provider.get_holdings()
        ticker_list = [h.ticker for h in holdings]

    articles = await provider.get_news(
        tickers=ticker_list,
        event_type=event_type,
    )

    is_live = provider.mode_name == "live"

    return {
        "articles":        articles,
        "total":           len(articles),
        "source":          provider.mode_name,
        "event_types":     EVENT_TYPES,
        # Explicit unavailability signal — avoids silent empty-state confusion in live mode.
        # When True, the UI should show "No news source configured for live mode"
        # rather than "No news found".
        "live_unavailable": is_live and len(articles) == 0,
        "scaffolded":       is_live,
    }


@router.get("/events", summary="Get upcoming corporate events")
async def get_events(
    provider: DataProvider,
    tickers: Optional[str] = Query(
        None,
        description="Comma-separated ticker list. If omitted, all holdings are used.",
    ),
    event_type: Optional[str] = Query(
        None,
        description="Filter by event type (earnings, dividend, agm, bonus, split).",
    ),
):
    """
    Return upcoming corporate events (earnings dates, dividends, AGMs).

    Events are sorted soonest-first.
    Phase 1: Static mock events. Phase 2: Live corporate calendar API.
    """
    if tickers:
        ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    else:
        holdings = await provider.get_holdings()
        ticker_list = [h.ticker for h in holdings]

    events = await provider.get_events(
        tickers=ticker_list,
        event_type=event_type,
    )

    is_live = provider.mode_name == "live"

    return {
        "events":          events,
        "total":           len(events),
        "source":          provider.mode_name,
        # Explicit unavailability signal — same logic as /news/.
        "live_unavailable": is_live and len(events) == 0,
        "scaffolded":       is_live,
    }
