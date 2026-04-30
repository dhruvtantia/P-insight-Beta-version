# Feature Spec — Peers Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/peers.py`, `app/data_providers/live_provider.py` (static peer map `_PEER_MAP` + FMP fallback + fundamentals fetch).
- Frontend: `frontend/src/hooks/usePeerComparison.ts`, `frontend/src/components/peers/`, `frontend/src/app/peers/`.

---

## Purpose

For a single ticker, surface its industry peers and compare them side-by-side on fundamentals so the user can answer "is this stock cheap/expensive/strong vs its peers?".

## Inputs

- `ticker` (URL path parameter).
- `mode` query param.

## Outputs

- **`GET /api/v1/peers/{ticker}?mode=...`** →
  ```json
  {
    "selected": {
      "ticker": "TCS.NS", "name": "Tata Consultancy Services",
      "sector": "IT Services",
      "pe_ratio": 30.2, "pb_ratio": 13.4, "ev_ebitda": 19.1,
      "roe": 45.1, "dividend_yield_pct": 1.2, "market_cap_cr": 1389000,
      "source": "yfinance", "error": null
    },
    "peers": [
      { "ticker": "INFY.NS", "name": "Infosys", "pe_ratio": 25.0, ... , "source": "yfinance" },
      { "ticker": "WIPRO.NS", "name": "Wipro", ... }
    ],
    "insights": [
      { "type": "valuation", "message": "TCS trades at a premium PE vs peers", "severity": "info" }
    ],
    "meta": {
      "source_dominant": "yfinance",
      "peer_source": "static_map|fmp|empty",
      "peers_count": 5
    }
  }
  ```

## Canonical data contract

**`PeerFundamentals`** = same shape as `FinancialRatio` (see [fundamentals-module-spec.md](./fundamentals-module-spec.md)) with `ticker` and `name` as identity. Reuse that type — do not fork.

**`PeerComparison`**: `selected: PeerFundamentals`, `peers: PeerFundamentals[]`, `insights: PeerInsight[]`, `meta`.

**`PeerInsight`**: `type` (`valuation` | `profitability` | `dividend` | `concentration`), `message`, `severity` (`info` | `warning` | `flag`).

## Backend / frontend split

- **Backend:** resolve peers (static map → FMP fallback → empty), fetch selected + each peer's fundamentals concurrently (`asyncio.gather`), compute insights (valuation premium/discount, ROE leadership, etc.), label source dominance. *Insights today are computed in frontend; should move backend — same pattern as fundamentals thresholds.*
- **Frontend:** `usePeerComparison(ticker)` calls endpoint, renders comparison table, ticker selector UI, "Add to watchlist" cross-action.

## Non-goals

- User-defined peer override (v2 feature — "compare TCS to ACN, IBM, INFY").
- Cross-sector comparison (peers are intra-sector only).
- Historical peer ratio charts.
- Peer news/event stream (News module already covers portfolio-wide news).

## Open issues

1. **No page-level aggregate timeout.** One slow peer fetch can block the whole response 15+s. Status doc §7.2 / refactor §2.2.
2. **Static `_PEER_MAP` is small (~150 NSE tickers)** — anything outside NIFTY 50 / Next 50 gets sparse or empty peers.
3. **No `industry_peers` table.** Map should move to DB so it can be seeded + refreshed from FMP without code changes.
4. **Insights computed in frontend** — relocate to backend with fundamentals thresholds (refactor §3.7).
5. **No custom peer override.** User can't curate.
6. **Redundant fundamentals fetch risk** — if user visits `/fundamentals` then `/peers/TCS`, TCS fundamentals are fetched twice across the request boundary (in-process cache catches it if within 30 min, but this is fragile).
