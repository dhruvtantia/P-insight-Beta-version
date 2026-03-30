"""
News & Events API Endpoints — Phase 1
---------------------------------------
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

Phase 2: Replace MockDataProvider with live NewsAPI / Bloomberg / yfinance provider.
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

    return {
        "articles":   articles,
        "total":      len(articles),
        "source":     provider.mode_name,
        "event_types": EVENT_TYPES,
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

    return {
        "events": events,
        "total":  len(events),
        "source": provider.mode_name,
    }
