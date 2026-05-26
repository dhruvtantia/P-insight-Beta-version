"""
Price enrichment state helpers.

Centralizes the small persistence rules shared by legacy upload confirm and
the V2 background upload workflow.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

PRICE_STATUSES = {
    "live",
    "stale",
    "missing",
    "fallback_average_cost",
    "uploaded_current_price",
    "provider_failed",
    "pending",
    "unknown",
}

TRUSTED_PRICE_STATUSES = {"live", "uploaded_current_price"}
PRICE_STALE_AFTER = timedelta(days=7)


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def canonical_price_status(
    *,
    price_status: str | None,
    current_price: float | None,
    price_timestamp: datetime | None = None,
    now: datetime | None = None,
) -> str:
    """
    Normalize persisted price state at read time.

    A stored provider price is visible after it ages out, but it is downgraded
    to stale so downstream analytics do not treat it as a fresh quote.
    """
    status = price_status if price_status in PRICE_STATUSES else None
    if current_price is None:
        return status or "fallback_average_cost"

    if status == "live":
        timestamp = _as_aware_utc(price_timestamp)
        if timestamp is not None:
            current_time = _as_aware_utc(now) or datetime.now(timezone.utc)
            if current_time - timestamp > PRICE_STALE_AFTER:
                return "stale"

    return status or "unknown"


def has_trusted_current_price(
    *,
    price_status: str | None,
    current_price: float | None,
    price_timestamp: datetime | None = None,
    now: datetime | None = None,
) -> bool:
    status = canonical_price_status(
        price_status=price_status,
        current_price=current_price,
        price_timestamp=price_timestamp,
        now=now,
    )
    return current_price is not None and status in TRUSTED_PRICE_STATUSES


def valuation_price_and_fallback(
    holding,
    *,
    allow_cost_basis_fallback: bool = True,
    now: datetime | None = None,
) -> tuple[float | None, bool, str]:
    """
    Return the valuation price, whether it used cost basis, and canonical status.
    """
    current_price = getattr(holding, "current_price", None)
    status = canonical_price_status(
        price_status=getattr(holding, "price_status", None),
        current_price=current_price,
        price_timestamp=getattr(holding, "price_timestamp", None),
        now=now,
    )
    if current_price is not None and status in TRUSTED_PRICE_STATUSES:
        return float(current_price), False, status
    if allow_cost_basis_fallback:
        return float(getattr(holding, "average_cost", 0) or 0), True, status
    return None, False, status


def persist_price_outcomes(
    *,
    db,
    portfolio_id: int,
    requested_tickers: Iterable[str],
    prices: dict[str, float],
    failure_reason: str | None = None,
) -> None:
    """
    Persist live-price outcomes for every holding in a portfolio.

    Successful tickers receive a live yfinance price. Missing tickers remain
    null unless the user uploaded a current_price, in which case that uploaded
    value is explicitly labelled rather than overwritten.
    """
    from app.models.portfolio import Holding

    requested = set(requested_tickers)
    fetched_at = datetime.now(timezone.utc)
    db_holdings = (
        db.query(Holding)
        .filter(Holding.portfolio_id == portfolio_id)
        .all()
    )

    for holding in db_holdings:
        if holding.ticker in prices:
            holding.current_price = prices[holding.ticker]
            holding.price_status = "live"
            holding.price_source = "yfinance"
            holding.price_timestamp = fetched_at
            holding.price_failure_reason = None
            continue

        if holding.ticker not in requested:
            continue

        if holding.current_price is not None:
            if holding.price_source == "yfinance" or holding.price_status == "live":
                holding.price_status = "stale"
                holding.price_failure_reason = (
                    failure_reason or "latest live lookup returned no price"
                )
            else:
                holding.price_status = holding.price_status or "uploaded_current_price"
                holding.price_source = holding.price_source or "uploaded_csv"
            continue

        holding.price_status = "provider_failed" if failure_reason else "missing"
        holding.price_source = "yfinance"
        holding.price_timestamp = fetched_at
        holding.price_failure_reason = failure_reason

    db.commit()
