# Feature Spec — Fundamentals Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/analytics.py` (ratios endpoint), `app/data_providers/live_provider.py` (`get_fundamentals`, `_FUND_CACHE`).
- Frontend: `frontend/src/hooks/useFundamentals.ts`, `frontend/src/lib/fundamentals.ts`, `frontend/src/app/fundamentals/`.

---

## Purpose

Provide per-holding valuation ratios (PE, PB, EV/EBITDA, ROE, margins, dividend yield, market cap) and a weighted portfolio-level aggregate, with explicit source labels and coverage metadata.

## Inputs

- `mode` query param.
- Implicitly: active portfolio holdings + weights from aggregation.
- Optionally: `holdings_override` for simulation use cases (future).

## Outputs

- **`GET /api/v1/analytics/ratios?mode=...`** →
  ```json
  {
    "holdings": [
      {
        "ticker": "TCS.NS", "sector": "IT Services",
        "pe_ratio": 30.2, "pb_ratio": 13.4, "ev_ebitda": 19.1,
        "roe": 45.1, "operating_margin_pct": 22.3,
        "dividend_yield_pct": 1.2, "market_cap_cr": 1389000,
        "source": "yfinance|fmp|unavailable",
        "error": null
      }
    ],
    "weighted": {
      "pe_ratio": 27.4, "pb_ratio": 6.2, "roe": 28.1, "dividend_yield_pct": 1.6
    },
    "meta": {
      "source_dominant": "yfinance",
      "coverage": { "pe_ratio": 20, "pb_ratio": 19, "ev_ebitda": 12 },
      "num_holdings": 22
    }
  }
  ```

## Canonical data contract

**`FinancialRatio`** (per holding): `ticker`, `sector`, `pe_ratio`, `pb_ratio`, `ev_ebitda`, `roe`, `operating_margin_pct`, `dividend_yield_pct`, `market_cap_cr`, `source`, `error`.

Each field is nullable. Null means "not available from the source" — never a silent 0.

**`WeightedFundamentals`**: same fields as `FinancialRatio` but aggregated by weight, with null-contributors excluded from the average denominator.

**`FundamentalsMeta`**: `source_dominant`, `coverage` (per-field non-null count), `num_holdings`.

## Backend / frontend split

- **Backend:** per-ticker fetch (yfinance → FMP fallback → unavailable), weighted aggregation re-normalising weights among non-null contributors, source labelling.
- **Frontend:** `useFundamentals(holdings)` calls the endpoint, merges ratios into holdings via `lib/fundamentals.ts::mergeWithFundamentals()` for display convenience. Renders colour-coded traffic lights via `peStatus()`, `pbStatus()`, `roeStatus()`. *Currently frontend owns the thresholds; refactor blueprint §3.7 moves them to backend.*

## Non-goals

- Historical fundamentals (today snapshot only; persistence is a v2 story).
- Forecasted / forward PE.
- Sector-aware weighting (flagged for v2).
- Non-equity fundamentals.

## Open issues

1. **No per-ticker timeout on the endpoint.** Status doc §7.1 / refactor §2.1.
2. **Thresholds in TypeScript** (`PE_CHEAP`, `PE_EXPENSIVE`, etc.) should move to backend config.
3. **Weighted-metric algorithm duplicated** in `frontend/src/lib/fundamentals.ts::computeWeightedMetrics` (used by simulation). Consolidate.
4. **No persistence.** Fresh fetch on cache miss every time. Acceptable for MVP.
5. **Weighted PE across sectors is mathematically dubious.** Show sector-aware breakdowns in v2.
