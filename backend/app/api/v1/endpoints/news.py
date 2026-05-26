"""
News & Events API Endpoints
---------------------------
Returns financial news and upcoming corporate events relevant to a supplied
ticker set or the current provider holdings.

Endpoints:
  GET /api/v1/news/
    ?mode=uploaded|live|broker
    &tickers=TCS.NS,INFY.NS     (optional; comma-separated)
    &event_type=earnings        (optional; one of the EVENT_TYPES list below)

  GET /api/v1/news/events
    ?mode=uploaded|live|broker
    &tickers=TCS.NS,INFY.NS     (optional)
    &event_type=earnings        (optional)

Live mode behaviour:
  - When NEWS_API_KEY is configured, news comes from NewsAPI.org.
  - When NEWS_API_KEY is absent, news returns [] with explicit availability flags.
  - Corporate events currently have no live provider and return [].
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Literal, Optional

from app.core.config import settings
from app.core.dependencies import DataProvider
from app.services.feature_registry import feature_dependency

router = APIRouter(
    prefix="/news",
    tags=["News & Events"],
    dependencies=[Depends(feature_dependency("news"))],
)

NewsEventType = Literal[
    "earnings",
    "dividend",
    "deal",
    "rating",
    "company_update",
    "market_event",
    "regulatory",
    "management",
]

CorporateEventType = Literal["earnings", "dividend", "agm", "bonus", "split"]
EventFilterType = Literal[
    "earnings",
    "dividend",
    "deal",
    "rating",
    "company_update",
    "market_event",
    "regulatory",
    "management",
    "agm",
    "bonus",
    "split",
]
StatusType = Literal["ok", "empty", "unavailable"]

# Supported event types — validated by FastAPI and mirrored by the frontend.
EVENT_TYPES: list[str] = [
    "earnings",
    "dividend",
    "deal",
    "rating",
    "company_update",
    "market_event",
    "regulatory",
    "management",
]


class NewsArticleResponse(BaseModel):
    title: str
    summary: str
    url: str
    published_at: str
    source: str
    tickers: list[str]
    event_type: NewsEventType
    sentiment: Literal["positive", "negative", "neutral"]


class NewsResponse(BaseModel):
    articles: list[NewsArticleResponse]
    total: int
    source: str
    event_types: list[str]
    news_key_configured: bool
    news_status: StatusType
    news_reason: Optional[str] = None
    live_unavailable: bool
    news_unavailable: bool
    scaffolded: bool


class CorporateEventResponse(BaseModel):
    ticker: str
    name: Optional[str] = None
    event_type: CorporateEventType
    title: str
    date: str
    details: Optional[str] = None


class EventsResponse(BaseModel):
    events: list[CorporateEventResponse]
    total: int
    source: str
    events_status: StatusType
    events_reason: Optional[str] = None
    live_unavailable: bool
    news_unavailable: bool
    scaffolded: bool


@router.get("/", response_model=NewsResponse, summary="Get portfolio-relevant news")
async def get_news(
    provider: DataProvider,
    tickers: Optional[str] = Query(
        None,
        description="Comma-separated ticker list to filter articles (e.g. TCS.NS,INFY.NS). "
                    "If omitted, all portfolio holdings are used.",
    ),
    event_type: Optional[NewsEventType] = Query(
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
    """
    # Resolve ticker list
    if tickers:
        ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    else:
        # Fall back to all holdings from the active provider
        holdings = await provider.get_holdings()
        ticker_list = [h.ticker for h in holdings]

    news_key_configured = bool(settings.NEWS_API_KEY)
    news_status = "ok"
    news_reason = None

    if not news_key_configured:
        articles = []
        news_status = "unavailable"
        news_reason = "NEWS_API_KEY is not configured"
    else:
        try:
            articles = await provider.get_news(
                tickers=ticker_list,
                event_type=event_type,
            )
        except Exception as exc:
            articles = []
            news_status = "unavailable"
            news_reason = f"{type(exc).__name__}: {str(exc)[:120]}"

    is_live = provider.mode_name == "live"
    # news_unavailable is reserved for provider/configuration failures.
    # A configured provider returning no matching articles is news_status="empty".
    if news_status == "ok" and len(articles) == 0:
        news_status = "empty"
        news_reason = "No articles matched the requested tickers or filters"
    news_unavailable = news_status == "unavailable"

    return {
        "articles":         articles,
        "total":            len(articles),
        "source":           provider.mode_name,
        "event_types":      EVENT_TYPES,
        "news_key_configured": news_key_configured,
        "news_status":     news_status,
        "news_reason":     news_reason,
        # live_unavailable kept for backwards compatibility; mirrors news_unavailable
        "live_unavailable": news_unavailable,
        "news_unavailable": news_unavailable,
        "scaffolded":       is_live,
    }


@router.get("/events", response_model=EventsResponse, summary="Get upcoming corporate events")
async def get_events(
    provider: DataProvider,
    tickers: Optional[str] = Query(
        None,
        description="Comma-separated ticker list. If omitted, all holdings are used.",
    ),
    event_type: Optional[EventFilterType] = Query(
        None,
        description="Filter by event type.",
    ),
):
    """
    Return upcoming corporate events (earnings dates, dividends, AGMs).

    Events are sorted soonest-first when a provider supplies them.
    At present, no live corporate events provider is configured.
    """
    if tickers:
        ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    else:
        holdings = await provider.get_holdings()
        ticker_list = [h.ticker for h in holdings]

    try:
        events = await provider.get_events(
            tickers=ticker_list,
            event_type=event_type,
        )
        events_status = "ok" if events else "empty"
        events_reason = None if events else "No corporate events matched the requested tickers or filters"
    except Exception as exc:
        events = []
        events_status = "unavailable"
        events_reason = f"{type(exc).__name__}: {str(exc)[:120]}"

    is_live = provider.mode_name == "live"
    news_key_configured = bool(settings.NEWS_API_KEY)

    return {
        "events":           events,
        "total":            len(events),
        "source":           provider.mode_name,
        "events_status":    events_status,
        "events_reason":    events_reason,
        "live_unavailable": is_live and events_status == "unavailable",
        "news_unavailable": not news_key_configured,
        "scaffolded":       is_live,
    }
