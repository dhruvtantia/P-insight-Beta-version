"""
Peer Comparison API Endpoints — Phase 1
-----------------------------------------
Returns the selected stock's full fundamentals plus those of its industry
peers, enabling a side-by-side valuation & quality comparison.

Response shape:
  {
    "ticker":  "TCS.NS",
    "selected": { ...15 fundamentals fields... },
    "peers":   [ { ...15 fields... }, ... ],
    "source":  "mock"
  }

Phase 2: Replace MockDataProvider with a live FMP / yfinance provider.
"""

from fastapi import APIRouter
from app.core.dependencies import DataProvider

router = APIRouter(prefix="/peers", tags=["Peer Comparison"])

# The 15 fundamentals fields we surface in the comparison table
FUND_FIELDS = [
    "name", "sector", "industry",
    "pe_ratio", "forward_pe", "pb_ratio", "ev_ebitda", "peg_ratio",
    "market_cap", "dividend_yield",
    "roe", "roa", "revenue_growth", "earnings_growth",
    "operating_margin", "profit_margin", "debt_to_equity",
]


def _extract(fundamentals: dict, ticker: str) -> dict:
    """Pull the standard field set from a raw fundamentals dict."""
    out: dict = {"ticker": ticker, "source": fundamentals.get("source", "mock")}
    for field in FUND_FIELDS:
        out[field] = fundamentals.get(field)
    return out


@router.get("/{ticker}", summary="Get peer comparison data")
async def get_peers(ticker: str, provider: DataProvider):
    """
    Return full fundamentals for the selected stock and each of its
    industry peers so the frontend can render a comparison table.

    Phase 1: Data served from mock_data/portfolio.json via MockDataProvider.
    Phase 2: Fetched from Financial Modeling Prep or yfinance.
    """
    upper = ticker.upper()

    # ── 1. Selected stock ────────────────────────────────────────────────────
    selected_fund = await provider.get_fundamentals(upper)
    selected = _extract(selected_fund, upper)

    # ── 2. Peer stocks ────────────────────────────────────────────────────────
    peer_tickers = await provider.get_peers(upper)
    peers = []
    for peer in peer_tickers:
        fund = await provider.get_fundamentals(peer)
        peers.append(_extract(fund, peer))

    return {
        "ticker":   upper,
        "selected": selected,
        "peers":    peers,
        "source":   selected_fund.get("source", "mock"),
    }
