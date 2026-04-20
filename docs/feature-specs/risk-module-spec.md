# Feature Spec — Risk / Quant Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/quant.py`, `app/analytics/quant_service.py`, `app/analytics/{risk,returns,benchmark,correlation}.py`, `app/optimization/*` (shares price pipeline).
- Frontend: `frontend/src/hooks/useQuantAnalytics.ts`, `frontend/src/lib/risk.ts`, `frontend/src/app/risk/`.

---

## Purpose

Two distinct things:
1. **Risk snapshot** — concentration & diversification metrics derived purely from holdings + sectors (HHI, effective N, top-3 weight, max position, diversification score, risk-profile classification, flags).
2. **Quant analytics** — metrics derived from time-series: volatility, Sharpe, Sortino, max drawdown, beta/alpha vs NIFTY 50, information ratio, VaR, correlation matrix, per-holding contributions, performance time series.

## Inputs

- **Risk snapshot:** holdings + sectors (already available after portfolio aggregation).
- **Quant:**
  - `mode` query param.
  - `period` query param (`1y|6mo|3mo`; default `1y`).
  - Implicitly: ~1 year of daily OHLC per ticker + benchmark series.

## Outputs

- **Risk snapshot (proposed — currently frontend-only):**
  ```json
  {
    "hhi": 0.12, "effective_n": 8.3,
    "top_holding_pct": 18.4, "top_three_pct": 42.1,
    "diversification_score": 62, "risk_profile": "moderate",
    "flags": { "single_stock": false, "sector_concentration": false },
    "thresholds": { "single_stock_flag_pct": 30, "sector_concentration_flag_pct": 50 }
  }
  ```
- **`GET /api/v1/quant/full?mode=...&period=1y`** →
  ```json
  {
    "metrics": {
      "volatility_ann": 17.4, "sharpe_ratio": 1.2, "sortino_ratio": 1.8,
      "max_drawdown_pct": -12.3, "beta": 0.92, "alpha_ann": 1.1,
      "tracking_error_ann": 4.3, "information_ratio": 0.25,
      "var_95_daily_pct": -1.4
    },
    "performance": [
      { "date": "2025-04-18", "portfolio": 1.00, "benchmark": 1.00 },
      { "date": "2025-04-19", "portfolio": 1.004, "benchmark": 1.002 },
      ...
    ],
    "drawdown": [{ "date": "...", "drawdown_pct": -3.2 }, ...],
    "correlation": [[1.0, 0.32, ...], ...],
    "contributions": [{ "ticker": "TCS.NS", "contribution_pct": 1.8 }, ...],
    "meta": {
      "benchmark_available": true, "benchmark": "^NSEI",
      "invalid_tickers": [], "cache_hit": true, "period": "1y"
    }
  }
  ```
- **`GET /api/v1/quant/status?mode=...`** → meta block only (fast).

## Canonical data contract

**`RiskSnapshot`** — see structure above.
**`QuantMetrics`** — see above; all fields nullable if benchmark unavailable (`beta`, `alpha_ann`, `tracking_error_ann`, `information_ratio`).
**`QuantBundle`** = `metrics` + `performance[]` + `drawdown[]` + `correlation[][]` + `contributions[]` + `meta`.

## Backend / frontend split

**Today:**
- Risk snapshot: 100% frontend (`lib/risk.ts`). Thresholds in TS.
- Quant: 100% backend (`QuantAnalyticsService.compute_all()`), cached 10 min live / 24h mock.

**Target:**
- Risk snapshot: backend-owned, included in `/portfolio/full` bundle. Frontend reads, colour-codes. See refactor blueprint §3.3.
- Quant: split `/quant/full` into composable endpoints (`/quant/metrics`, `/quant/performance`, `/quant/correlation`). Cache in Redis.

## Non-goals

- Custom benchmarks (NIFTY 50 only).
- Factor model decomposition (v2).
- Per-sector risk attribution (v2).
- Intraday analytics.

## Open issues

1. **Risk snapshot lives in TypeScript.** Biggest intelligence-boundary violation in the codebase. Refactor §3.3.
2. **Cold-load latency on `/quant/full`** (5–20s) — wiped on every restart. Needs Redis. Refactor §3.4.
3. **Bundled endpoint mixes 5+ concerns.** Splitting lets frontend render partial UI sooner.
4. **No historical metric persistence.** "Is my Sharpe better than last month?" is unanswerable.
5. **Benchmark fetch failures cache the failure or not?** Verify: an unavailable response should still be cached briefly so we don't hammer yfinance on repeat misses.
6. **PyPortfolioOpt dependency has known failure modes** with <5 holdings or degenerate covariance — currently in `/optimize`, `/simulate`; consider extracting covariance utility to be shared with `/quant/full` correlation path.
