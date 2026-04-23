"""
Peer Comparison API Endpoints
-----------------------------------------
Returns the selected stock's full fundamentals plus those of its industry
peers, enabling a side-by-side valuation & quality comparison.

Response shape (Peers Isolation phase):
  {
    "ticker":   "TCS.NS",
    "selected": { ...fundamentals fields... },
    "peers":    [ { ...fundamentals fields... }, ... ],
    "source":   "yfinance" | "mock" | "unavailable",
    "peer_count": int,
    "meta": {
      "ticker":               str,
      "peer_count_requested": int,
      "peer_count_available": int,
      "unavailable_peers":    [str, ...],
      "timed_out_peers":      [str, ...],
      "incomplete":           bool,   // true if any peer timed out or failed
      "sparse_set":           bool,   // true if < 2 peers returned usable data
      "source":               str,
      "fetched_at":           str,    // ISO-8601 UTC
    },
    "rankings": {
      "<metric_key>": {
        "ranks":           [int | null, ...],   // index 0 = selected stock
        "total_with_data": int,
        "lower_is_better": bool,
      },
      ...
    }
  }

Per-peer timeout (PEER_TIMEOUT_SECS):
  Each peer fundamentals fetch is wrapped in asyncio.wait_for so a single
  slow yfinance call cannot block the entire response.  Timed-out peers are
  returned with source="timeout" and are listed explicitly in meta so the
  frontend can render an honest incomplete-set notice.

Server-side rankings:
  Rankings for all numeric comparison metrics are pre-computed here so the
  frontend renders directly without duplicating ranking logic.
  Rank 1 = best (lowest value when lower_is_better, highest otherwise).
  null = the stock had no data for that metric.
"""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from app.core.dependencies import DataProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/peers", tags=["Peer Comparison"])

# ── Field sets ────────────────────────────────────────────────────────────────

# Full fundamentals fields surfaced in the comparison table
FUND_FIELDS = [
    "name", "sector", "industry",
    "pe_ratio", "forward_pe", "pb_ratio", "ev_ebitda", "peg_ratio",
    "market_cap", "dividend_yield",
    "roe", "roa", "revenue_growth", "earnings_growth",
    "operating_margin", "profit_margin", "debt_to_equity",
]

# Numeric metrics we rank across all stocks in the comparison set.
# market_cap is intentionally excluded — it's shown in cards but ranking by
# size is not a quality signal in the way the other metrics are.
RANKED_METRICS = [
    "pe_ratio", "forward_pe", "pb_ratio", "ev_ebitda", "peg_ratio",
    "dividend_yield",
    "roe", "roa", "revenue_growth", "earnings_growth",
    "operating_margin", "profit_margin", "debt_to_equity",
]

# Metrics where a lower value is the better outcome
LOWER_IS_BETTER: frozenset[str] = frozenset({
    "pe_ratio", "forward_pe", "pb_ratio",
    "ev_ebitda", "peg_ratio", "debt_to_equity",
})

# ── Tuning constants ──────────────────────────────────────────────────────────

# Seconds before an individual peer fundamentals fetch is abandoned
_PEER_TIMEOUT_SECS = 5.0

# Minimum number of peers with usable data before we flag the set as sparse.
# A comparison with 0 or 1 peer is not meaningful — surface this explicitly.
_SPARSE_THRESHOLD = 2


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _compute_rankings(all_stocks: list[dict]) -> dict:
    """
    Pre-compute rank positions for each RANKED_METRICS across all stocks.

    Returns::

        {
          "pe_ratio": {
            "ranks":           [1, 2, None, 3],
            "total_with_data": 3,
            "lower_is_better": True,
          },
          ...
        }

    Index 0 in ``ranks`` corresponds to the selected stock; subsequent
    indices correspond to peers in the order they appear in ``all_stocks``.
    A None rank means that stock had no data for that metric.
    """
    rankings: dict = {}
    for metric in RANKED_METRICS:
        lower_is_better = metric in LOWER_IS_BETTER
        values: list = [s.get(metric) for s in all_stocks]

        # Only rank non-null values
        indexed = [(i, v) for i, v in enumerate(values) if v is not None]
        indexed.sort(key=lambda x: x[1] if lower_is_better else -x[1])

        ranks: list = [None] * len(all_stocks)
        for rank_pos, (idx, _) in enumerate(indexed):
            ranks[idx] = rank_pos + 1

        rankings[metric] = {
            "ranks":           ranks,
            "total_with_data": len(indexed),
            "lower_is_better": lower_is_better,
        }
    return rankings


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/{ticker}", summary="Get peer comparison data")
async def get_peers(ticker: str, provider: DataProvider):
    """
    Return full fundamentals for the selected stock and each of its
    industry peers so the frontend can render a comparison table.

    Key guarantees
    --------------
    * Per-peer timeout — no single slow peer blocks the whole response.
    * Honest incomplete state — timed-out / failed peers are listed in meta
      rather than silently dropped or pretended to be a full set.
    * Sparse-set flag — the response explicitly signals when < 2 peers
      returned usable data (i.e. the comparison is not meaningful).
    * Server-side rankings — rank positions for all numeric comparison
      metrics are pre-computed so the frontend renders directly.
    """
    upper = ticker.upper()
    fetched_at = datetime.now(timezone.utc).isoformat()

    # ── 1. Selected stock fundamentals + peer ticker list (concurrent) ────────
    selected_fund, peer_tickers = await asyncio.gather(
        provider.get_fundamentals(upper),
        provider.get_peers(upper),
    )
    selected = _extract(selected_fund, upper)
    peer_count_requested = len(peer_tickers)

    # ── 2. Peer fundamentals — concurrent, per-peer timeout ───────────────────
    timed_out_peers:   list[str] = []
    unavailable_peers: list[str] = []
    peers:             list[dict] = []

    if peer_tickers:
        async def _fetch_with_timeout(peer: str) -> dict:
            """Fetch one peer with a hard timeout so slow calls don't block."""
            try:
                return await asyncio.wait_for(
                    provider.get_fundamentals(peer),
                    timeout=_PEER_TIMEOUT_SECS,
                )
            except asyncio.TimeoutError:
                return {
                    "source": "timeout",
                    "error":  f"Timed out after {_PEER_TIMEOUT_SECS:.0f}s",
                }
            except Exception as exc:  # noqa: BLE001
                return {"source": "unavailable", "error": str(exc)}

        peer_funds = await asyncio.gather(
            *[_fetch_with_timeout(peer) for peer in peer_tickers],
        )

        for peer, fund in zip(peer_tickers, peer_funds):
            row = _extract(fund, peer)
            peers.append(row)

            src = fund.get("source", "unknown")
            if src == "timeout":
                timed_out_peers.append(peer)
                logger.warning("Peer fundamentals timed out: %s", peer)
            elif src in ("unavailable", "unknown") or fund.get("error"):
                unavailable_peers.append(peer)
                logger.warning(
                    "Peer fundamentals unavailable: %s — %s",
                    peer, fund.get("error"),
                )

    # ── 3. Trust / coverage metadata ─────────────────────────────────────────
    # Peers whose fundamentals were actually returned by the data provider
    peer_count_available = sum(
        1 for p in peers
        if p.get("source") not in ("timeout", "unavailable", "unknown")
    )

    # Dominant source for the response envelope (prefer yfinance > mock)
    all_sources = {selected_fund.get("source", "unknown")} | {
        p.get("source", "unknown") for p in peers
    }
    dominant_source = (
        "yfinance"    if "yfinance"    in all_sources else
        "mock"        if "mock"        in all_sources else
        "unavailable"
    )

    # incomplete = any peer failed to return data
    incomplete = bool(timed_out_peers or unavailable_peers)

    # sparse_set = the usable peer count is too low for a meaningful comparison
    sparse_set = peer_count_available < _SPARSE_THRESHOLD

    meta = {
        "ticker":               upper,
        "peer_count_requested": peer_count_requested,
        "peer_count_available": peer_count_available,
        "unavailable_peers":    unavailable_peers,
        "timed_out_peers":      timed_out_peers,
        "incomplete":           incomplete,
        "sparse_set":           sparse_set,
        "source":               dominant_source,
        "fetched_at":           fetched_at,
    }

    # ── 4. Server-side rankings (selected first, then peers in order) ─────────
    all_stocks = [selected, *peers]
    rankings = _compute_rankings(all_stocks)

    # ── 5. Response ───────────────────────────────────────────────────────────
    return {
        "ticker":     upper,
        "selected":   selected,
        "peers":      peers,
        "source":     dominant_source,
        "peer_count": len(peers),
        "meta":       meta,
        "rankings":   rankings,
    }
