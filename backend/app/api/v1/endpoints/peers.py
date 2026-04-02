"""
Peer Comparison API Endpoints
-----------------------------------------
Returns the selected stock's full fundamentals plus those of its industry
peers, enabling a side-by-side valuation & quality comparison.

Response shape:
  {
    "ticker":  "TCS.NS",
    "selected": { ...15 fundamentals fields... },
    "peers":   [ { ...15 fields... }, ... ],
    "source":  "yfinance" | "mock" | "unavailable"
  }

Peer fundamentals are fetched in parallel (asyncio.gather) to avoid the
cumulative latency of sequential yfinance calls (5 peers × 1-2s = 5-10s
sequentially vs ~1-2s in parallel).
"""

import asyncio
import logging

from fastapi import APIRouter
from app.core.dependencies import DataProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/peers", tags=["Peer Comparison"])

# The fundamentals fields surfaced in the comparison table
FUND_FIELDS = [
    "name", "sector", "industry",
    "pe_ratio", "forward_pe", "pb_ratio", "ev_ebitda", "peg_ratio",
    "market_cap", "dividend_yield",
    "roe", "roa", "revenue_growth", "earnings_growth",
    "operating_margin", "profit_margin", "debt_to_equity",
]


def _extract(fundamentals: dict, ticker: str) -> dict:
    """Pull the standard field set from a raw fundamentals dict."""
    out: dict = {
        "ticker": ticker,
        "source": fundamentals.get("source", "unknown"),
        "error":  fundamentals.get("error"),
    }
    for field in FUND_FIELDS:
        out[field] = fundamentals.get(field)
    return out


@router.get("/{ticker}", summary="Get peer comparison data")
async def get_peers(ticker: str, provider: DataProvider):
    """
    Return full fundamentals for the selected stock and each of its
    industry peers so the frontend can render a comparison table.

    Peer fundamentals are fetched concurrently via asyncio.gather so that
    total latency is bounded by the slowest single fetch (~1-2s), not
    the sum of all fetches (5-10s).

    When fundamentals are unavailable (yfinance not installed, rate-limited,
    or ticker unknown), each entry has source="unavailable" and an error
    field rather than silently returning nulls.
    """
    upper = ticker.upper()

    # ── 1. Selected stock fundamentals + peer list (concurrent) ─────────────
    selected_fund, peer_tickers = await asyncio.gather(
        provider.get_fundamentals(upper),
        provider.get_peers(upper),
    )
    selected = _extract(selected_fund, upper)

    # ── 2. All peer fundamentals — fetched concurrently ───────────────────────
    if peer_tickers:
        peer_funds = await asyncio.gather(
            *[provider.get_fundamentals(peer) for peer in peer_tickers],
            return_exceptions=True,
        )
        peers = []
        for peer, fund in zip(peer_tickers, peer_funds):
            if isinstance(fund, Exception):
                logger.warning("Peer fundamentals failed for %s: %s", peer, fund)
                peers.append({
                    "ticker": peer,
                    "source": "unavailable",
                    "error":  str(fund),
                    **{f: None for f in FUND_FIELDS},
                })
            else:
                peers.append(_extract(fund, peer))  # type: ignore[arg-type]
    else:
        peers = []

    # Surface the dominant source (prefer yfinance > mock > unavailable)
    all_sources = {selected_fund.get("source", "unknown")} | {
        p.get("source", "unknown") for p in peers
    }
    dominant_source = (
        "yfinance"   if "yfinance"   in all_sources else
        "mock"       if "mock"       in all_sources else
        "unavailable"
    )

    return {
        "ticker":     upper,
        "selected":   selected,
        "peers":      peers,
        "source":     dominant_source,
        "peer_count": len(peers),
    }
