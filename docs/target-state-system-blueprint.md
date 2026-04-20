# P-Insight — Target-State System Blueprint

**Status:** Authoritative design reference, April 2026.
**Scope:** Defines the ideal stable, modular, beta-ready version of P-Insight.
**Audience:** Every engineer, AI agent, or contributor about to modify the codebase.

> **How to use this document.**
> This is the north star, not a status report. When you are about to write a function, add an endpoint, or redesign a page, ask: *does this align with the target state described here?* If it moves the system toward this target, proceed. If it entrenches the current anti-patterns, stop and redesign. The current codebase is approximately 65% of the way toward this target. This document describes the other 35%.

> **What this document is not.**
> It is not a step-by-step implementation guide (see `refactor-rebuild-blueprint.md`). It is not a feature list (see `product-requirements-mvp.md`). It is the architectural vision: what the system should *be*, expressed as contracts, principles, and constraints.

---

## 1. Product Goal and Target User

### Product goal (one sentence)

**P-Insight is a private, locally-hosted portfolio intelligence platform that turns a retail investor's CSV export into institutional-grade analytics, with a conversational assistant, in under 30 seconds.**

Every architectural decision should serve that sentence. Speed, intelligence, and privacy — in that order.

### Target user (one paragraph)

A retail investor in Indian equities with ₹10 lakh to ₹5 crore invested across 10–50 individual stocks. They export a CSV from their broker (Zerodha, ICICI Direct, HDFC Securities, Groww, Upstox) or maintain their own spreadsheet. They have financial literacy but are not quants. They want to understand their portfolio at a level that was previously only available to professionals with Bloomberg terminals or PMS accounts. They do not want to pay a subscription for analytics software. They value privacy. They come back weekly, not daily.

### What this product is NOT

- A trading platform (no order routing, no intraday, no F&O).
- A multi-client RIA tool (no auth, no client management, no SEBI compliance).
- A mutual fund analyzer (equity-first; funds are a different data pipeline).
- A US/EU equity platform (NSE-focused: sector map, peer map, and benchmark are India-specific).
- A data aggregator or screener (we analyze portfolios the user uploads; we do not build a stock database).

---

## 2. Ideal User Flow (Landing to Intelligence)

The flow below is the canonical happy path. Every module, endpoint, and page exists to serve this flow. If a component does not serve this flow, it either belongs in a post-beta tier or should be deleted.

```
Step 1: User lands on /market
  → Sees three NIFTY index chips (live or last-close), sector heatmap, top movers.
  → No portfolio required. Market page is ambient context, not a dashboard.
  → Prominent "Upload your portfolio →" CTA.

Step 2: User uploads CSV on /upload
  → Wizard: drop file → preview column mapping (auto-confirmed if high-confidence) → confirm.
  → POST /upload/parse returns preview in <3s.
  → POST /upload/v2/confirm persists holdings in <2s.
  → App auto-activates "Uploaded" mode.
  → User is navigated to /dashboard immediately. Enrichment continues in background.

Step 3: Dashboard (/dashboard)
  → ONE HTTP call: GET /portfolio/full?mode=uploaded
  → Returns: holdings, summary KPIs, sector allocation, risk snapshot, weighted fundamentals.
  → Page renders in <500ms from cached data, <2s from DB cold.
  → Action Center shows 2–4 pre-computed insights (concentration, missing diversification, etc.).
  → Enrichment banner shows background progress. Dismisses when enrichment_complete=true.

Step 4: Deep dives (any order)
  → /holdings    — full holdings table, enrichment status per row, sort/filter.
  → /fundamentals — PE, PB, EV/EBITDA, ROE per holding + weighted portfolio panel.
  → /risk        — HHI concentration + quant analytics (Sharpe, beta, drawdown, correlation).
  → /peers       — per-holding peer comparison (click from holdings or fundamentals table).
  → /changes     — snapshot delta; daily auto-snapshot after first week.
  → /news        — relevant articles + corporate events (requires NewsAPI key; graceful without).
  → /advisor     — conversational intelligence; AI if key set, structured rule-engine fallback.

Step 5: Recurring engagement
  → Daily auto-snapshot captured silently.
  → User returns weekly; /changes shows what shifted.
  → /watchlist for tracking stocks not yet in portfolio.
  → Advisor query: "Should I rebalance?" → structured answer + caveats + disclaimer.

Everything off this path:
  /optimize, /simulate, /frontier → hidden from nav; accessible by direct URL for power users.
  /brokers → scaffold; hidden; not beta.
  /ai-chat → deleted (superseded by /advisor).
  /sectors → deleted (redundant with dashboard).
```

---

## 3. Core Modules and Their Contracts

Each module owns one concern. The contract defines its inputs, outputs, and failure behaviour. Nothing else.

### Module 1 — Upload / Ingestion
**Owns:** Everything from file upload to persisted, enriched portfolio.
**Contract:** Accept a messy CSV. Return a clean, enriched portfolio in the DB. Never block the user.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `POST /upload/parse` | <3s | Column detection, preview rows, mapping confidence |
| `POST /upload/v2/confirm` | <2s | Persist holdings, fire background enrichment |
| `GET /upload/status?portfolio_id=N` | <100ms | Per-holding enrichment progress |

**Output guarantee:** After `confirm`, the portfolio is in the DB with `enrichment_status="pending"` on every holding and in the in-memory cache. It is immediately usable. Enrichment does not block this.

**Failure philosophy:** A holding that cannot be enriched is still a holding. A ticker not found in yfinance still shows in the dashboard with `sector="Unknown"`. No holding is silently dropped. Enrichment failure is surfaced as `enrichment_status="failed"` + `failure_reason` per holding, visible in the status endpoint.

---

### Module 2 — Portfolio Aggregation
**Owns:** The canonical portfolio representation consumed by all display pages.
**Contract:** Accept holdings from any provider. Return a fully pre-computed portfolio bundle.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `GET /portfolio/full?mode=...` | <500ms (cached), <2s (DB cold) | Holdings + summary + sectors + risk_snapshot + weighted_fundamentals |
| `GET /portfolios/` | <100ms | Portfolio metadata list |
| `PUT /portfolios/{id}/activate` | <100ms | Set active portfolio |

**Output guarantee:** The bundle includes all pre-computed fields (market_value, pnl, pnl_pct, weight per holding; total_value, total_pnl, top_sector in summary; hhi, risk_level in risk_snapshot; weighted PE/PB/ROE in fundamentals_summary). The frontend does NOT compute any of these.

**Single-fetch principle:** One page, one HTTP call to `/portfolio/full`. No page should mount independent sub-calls for data that belongs in this bundle.

---

### Module 3 — Fundamentals
**Owns:** Per-holding financial ratios and weighted portfolio metrics.
**Contract:** Accept a list of tickers. Return ratios + weighted aggregates + coverage metadata.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `GET /analytics/ratios?mode=...` | <5s (any holding), never blocks >10s | PE, PB, EV/EBITDA, ROE, margin per holding + weighted portfolio panel |

**Output guarantee:** Response always includes `meta.coverage_pct`, `meta.available_tickers`, `meta.unavailable_tickers`. If a ticker is unavailable, it appears in the response with `source="unavailable"` and `error="reason"`. It is never silently omitted.

**Intelligence location:** All thresholds (PE_CHEAP=15, PE_EXPENSIVE=30, ROE_STRONG=18, etc.) live in Python as named constants in `app/services/fundamentals_view_service.py`. They are shipped as `thresholds` in the API response. Frontend reads them; it never hardcodes them.

---

### Module 4 — Risk / Quant Analytics
**Owns:** Historical quantitative analytics: returns, risk, correlation, performance attribution.
**Contract:** Accept holdings. Return pre-computed analytics with explicit coverage metadata.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `GET /quant/full?mode=...&period=1y` | <200ms (cached), <20s (cold) | Sharpe, vol, beta, drawdown, correlation, contributions |
| `GET /quant/status?mode=...` | <50ms | Cache state (warm / warming / cold) |

**Output guarantee:**
- Response always includes `meta.valid_tickers`, `meta.excluded_tickers`, `meta.excluded_reason`.
- If a holding had no price history, it appears in `excluded_tickers` with a human-readable reason.
- The correlation matrix always states its dimension in `meta` (e.g. `"correlation_n": 14` when portfolio has 20 holdings and 6 were excluded).
- `portfolio_usable: bool` in response tells frontend whether data is complete enough to display.

**Cross-period caching strategy:** The quant service downloads 2 years of daily price history once. Individual period requests (1y, 6m, 3m, 1m) are served by slicing the cached matrix. A "period" switch never triggers a full re-download.

**Intelligence location:** All risk formulas (Sharpe, beta, drawdown, VaR, correlation) live in Python. The frontend receives pre-computed numbers. It renders charts; it does not calculate anything.

---

### Module 5 — History / Changes
**Owns:** Portfolio value over time and snapshot-to-snapshot deltas.
**Contract:** Build daily portfolio value series automatically. Provide diffs between any two snapshots.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `GET /history/{portfolio_id}/daily` | <200ms (cached) | Daily portfolio value time series (1y) |
| `GET /history/{portfolio_id}/status` | <50ms | Whether history build is complete |
| `GET /portfolios/{id}/snapshots` | <100ms | List of snapshots |
| `GET /snapshots/{id}/delta?compare_to={id}` | <200ms | Holdings diff between two snapshots |

**Output guarantee:** Daily history is built in the background after upload. The `/status` endpoint surfaces build progress. If history is not yet built, `/daily` returns `{"status": "building", "data": []}` — never an error, never an empty array that looks like a real empty portfolio.

**Snapshot discipline:** A daily auto-snapshot fires at 9:00 PM IST for any active uploaded portfolio. The scheduler is idempotent (skips if one already exists for today). The first snapshot is captured at upload time. The Changes page is therefore useful after day 2, not day 30.

---

### Module 6 — Peers
**Owns:** Per-holding peer comparison using same-sector candidates.
**Contract:** Accept a ticker. Return enriched peer metrics. Never hang.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `GET /peers/{ticker}?mode=...` | <5s (per peer), <10s total, hard timeout 12s | Sector peers + metric comparison table |

**Output guarantee:** All peer fetches run with a per-peer timeout (5s) in a ThreadPoolExecutor. An aggregate hard timeout of 12s kills the entire call if it has not returned. Response includes `meta.peer_count_requested`, `meta.peer_count_returned`, and per-peer `available: bool`.

---

### Module 7 — Market Data
**Owns:** Market-wide context: indices, sector performance, top movers.
**Contract:** Return market overview from a short-TTL cache. Never block on individual tickers.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `GET /market/overview` | <500ms (2-min cache), <10s cold | Index chips, sector heatmap, gainers/losers |

**Output guarantee:** Each index/ticker fetched with an independent 5s timeout. If NIFTY50 fetch fails, it returns `{"ticker": "^NSEI", "available": false, "last_known_close": N}`. The page never shows a blank state — it degrades to "last known" values with an age indicator.

---

### Module 8 — Advisor
**Owns:** Conversational intelligence about the user's portfolio.
**Contract:** Accept a natural-language query. Return a structured, cited response with explicit disclaimer.

| Endpoint | Latency SLA | What it does |
|---|---|---|
| `POST /advisor/ask` | <8s (AI), <2s (rule-based) | Portfolio-aware query response |
| `GET /advisor/status` | <50ms | Engine availability + conversation history |

**Output guarantee:**
- Every response includes `disclaimer: "Informational only. Not investment advice. ..."` — non-negotiable, non-removable by any frontend component.
- Response includes `engine: "claude" | "openai" | "rule_based"` and `engine_version`.
- If AI is unavailable, rule-based fallback fires automatically. User sees a `"limited mode"` badge, not an error.
- All financial claims in the response cite the specific metric and its source (e.g. "your PE ratio of 24x, vs sector average 18x...").

---

## 4. Backend vs Frontend Responsibility Split

This is the most important architectural principle in the system. Violations of this split are the primary source of bugs, duplication, and fragility in the current codebase.

### Backend owns (non-negotiable)

| Concern | Location | Why |
|---|---|---|
| All financial formulas | `app/analytics/`, `app/services/` | Formula changes should not ship as JS bundles |
| Risk snapshot computation | `app/services/risk_snapshot_service.py` | HHI, diversification score, risk classification |
| Weighted fundamentals aggregation | `app/services/fundamentals_view_service.py` | Weighting logic, null handling, coverage stats |
| Portfolio-level P&L, weights, market value | `app/services/portfolio_service.py` | Computed once per response, not re-derived per page |
| Enrichment thresholds | `app/ingestion/`, `app/core/thresholds.py` | Sector boundaries, ISIN detection, alert criteria |
| Data classification labels | API responses as named constants | "enriched", "partial", "pending", "failed" |
| All yfinance and FMP calls | `app/data_providers/` | Rate-limiting, retries, caching all centralized |
| Per-ticker and per-call timeouts | Backend service layer | Never expose blocking external calls to the frontend |
| Business rules (e.g. "diversified if HHI < 0.15") | Python | Testable, consistent, not duplicated |

### Frontend owns (and only these things)

| Concern | Location | Why |
|---|---|---|
| Rendering and layout | `src/app/`, `src/components/` | Display-only |
| User interaction state | `src/store/`, `src/hooks/` | Mode toggle, active portfolio, filter selections |
| Navigation | Next.js router | Routing only |
| Chart rendering | Recharts/d3 components | Visual transformation of pre-computed data |
| Loading and error states | Per-component | UI concern |
| Color mappings for status labels | `src/lib/display.ts` | "enriched" → green, "failed" → red |
| Form validation (upload wizard) | Upload components | Immediate feedback before server call |
| Session-scoped simulation state | `simulationStore` | Ephemeral what-if sliders |

### The rule stated plainly

**If you are writing `if value > threshold` or `x * y / z` or `Math.sqrt()` anywhere in TypeScript that is not a visual transformation (e.g. computing a chart scale), you are in the wrong layer. Move it to Python.**

---

## 5. Canonical Data Contracts

These are the shapes that all consumers (pages, hooks, AI prompts) should depend on. They are the stable contracts. Internal implementation may change; these shapes must not change without a deprecation cycle.

---

### 5.1 Upload Contract

**POST /upload/parse → ParseResponse**
```json
{
  "column_names": ["Symbol", "Qty", "Avg Price", "Sector"],
  "detected_mapping": {
    "ticker": "Symbol",
    "quantity": "Qty",
    "average_cost": "Avg Price",
    "sector": "Sector",
    "name": null,
    "current_price": null,
    "industry": null,
    "purchase_date": null,
    "notes": null
  },
  "ambiguous_fields": [],
  "high_confidence": true,
  "preview_rows": [{"ticker": "TCS", "quantity": 50, "average_cost": 3500, ...}],
  "row_count": 23,
  "missing_optional": ["name", "current_price", "industry", "purchase_date", "notes"],
  "required_fields": ["ticker", "quantity", "average_cost"],
  "optional_fields": ["name", "current_price", "sector", "industry", "purchase_date", "notes"]
}
```

**POST /upload/v2/confirm → V2ConfirmResponse**
```json
{
  "portfolio_id": 17,
  "filename": "portfolio.csv",
  "imported_at": "2026-04-20T13:00:00Z",
  "total_rows": 25,
  "rows_valid": 22,
  "rows_valid_with_warning": 1,
  "rows_invalid": 2,
  "rejected_rows": [{"row_index": 4, "raw_ticker": null, "reasons": ["missing ticker"]}],
  "warning_rows": [{"row_index": 12, "ticker": "INE009A01021", "warnings": ["ISIN format..."]}],
  "enrichment_started": true,
  "enrichment_complete": false,
  "portfolio_usable": true,
  "next_action": "dashboard",
  "message": "Successfully imported 23 holding(s). 2 row(s) could not be imported."
}
```

**GET /upload/status?portfolio_id=17 → V2StatusResponse**
```json
{
  "portfolio_id": 17,
  "total_holdings": 23,
  "enriched": 18,
  "partial": 3,
  "pending": 0,
  "failed": 2,
  "enrichment_complete": true,
  "overall": "done",
  "holdings": [
    {
      "ticker": "TCS",
      "normalized_ticker": "TCS.NS",
      "enrichment_status": "enriched",
      "sector_status": "yfinance",
      "name_status": "from_file",
      "fundamentals_status": "fetched",
      "peers_status": "found",
      "failure_reason": null,
      "last_enriched_at": "2026-04-20T13:00:45Z"
    }
  ]
}
```

**Canonical Holding (the base unit the entire system passes around)**
```json
{
  "ticker": "TCS",
  "normalized_ticker": "TCS.NS",
  "name": "Tata Consultancy Services Ltd.",
  "quantity": 50,
  "average_cost": 3500.0,
  "current_price": 3820.0,
  "sector": "Information Technology",
  "industry": "IT Services & Consulting",
  "asset_class": "Equity",
  "currency": "INR",
  "purchase_date": "2023-04-15",
  "notes": null,
  "data_source": "uploaded",
  "enrichment_status": "enriched",
  "sector_status": "yfinance",
  "fundamentals_status": "fetched",
  "peers_status": "found",
  "last_enriched_at": "2026-04-20T13:00:45Z",
  "failure_reason": null
}
```

---

### 5.2 Portfolio Aggregation Contract

**GET /portfolio/full?mode=uploaded → PortfolioFullResponse**
```json
{
  "holdings": [
    {
      "ticker": "TCS",
      "name": "Tata Consultancy Services Ltd.",
      "quantity": 50,
      "average_cost": 3500.0,
      "current_price": 3820.0,
      "sector": "Information Technology",
      "market_value": 191000.0,
      "pnl": 16000.0,
      "pnl_pct": 9.14,
      "weight": 0.182,
      "data_source": "uploaded",
      "enrichment_status": "enriched"
    }
  ],
  "summary": {
    "total_value": 1050000.0,
    "total_cost": 950000.0,
    "total_pnl": 100000.0,
    "total_pnl_pct": 10.53,
    "num_holdings": 23,
    "top_sector": "Information Technology",
    "data_source": "uploaded",
    "as_of": "2026-04-20T13:15:00Z"
  },
  "sectors": [
    {"sector": "Information Technology", "value": 380000.0, "weight_pct": 36.2, "num_holdings": 5}
  ],
  "risk_snapshot": {
    "hhi": 0.082,
    "top1_weight": 0.182,
    "top3_weight": 0.47,
    "num_sectors": 7,
    "risk_level": "moderate",
    "diversification_score": 72,
    "flags": ["heavy_it_exposure"]
  },
  "fundamentals_summary": {
    "wtd_pe": 22.4,
    "wtd_pb": 4.1,
    "wtd_roe": 24.6,
    "wtd_ev_ebitda": 16.2,
    "coverage_pct": 87.0,
    "unavailable_tickers": ["SOMESMALLCAP"]
  },
  "meta": {
    "portfolio_id": 17,
    "source": "uploaded",
    "cache_age_seconds": 45,
    "enrichment_complete": true
  }
}
```

---

### 5.3 Fundamentals Contract

**GET /analytics/ratios?mode=uploaded → FinancialRatiosResponse**
```json
{
  "holdings": [
    {
      "ticker": "TCS",
      "name": "Tata Consultancy Services Ltd.",
      "sector": "Information Technology",
      "pe_ratio": 28.4,
      "pb_ratio": 12.1,
      "ev_ebitda": 20.3,
      "roe": 48.2,
      "roa": 18.7,
      "operating_margin": 25.1,
      "dividend_yield": 1.2,
      "market_cap": 1380000000000,
      "source": "yfinance",
      "fetched_at": 1745150000.0,
      "cache_age_seconds": 3600
    },
    {
      "ticker": "SOMESMALLCAP",
      "name": "Some Small Cap Ltd.",
      "sector": "Unknown",
      "source": "unavailable",
      "error": "yfinance: no data returned for SOMESMALLCAP.NS",
      "pe_ratio": null
    }
  ],
  "weighted": {
    "wtd_pe": 22.4,
    "wtd_pb": 4.1,
    "wtd_roe": 24.6,
    "wtd_ev_ebitda": 16.2,
    "wtd_div_yield": 1.4,
    "wtd_operating_margin": 19.8,
    "coverage": {"pe": 21, "pb": 21, "roe": 19, "ev_ebitda": 18}
  },
  "meta": {
    "source": "yfinance",
    "as_of": "2026-04-20T13:00:00Z",
    "incomplete": true,
    "total_holdings": 23,
    "available_holdings": 21,
    "unavailable_tickers": ["SOMESMALLCAP", "TINYCAP"],
    "coverage_pct": 91.3
  },
  "thresholds": {
    "pe_cheap": 12,
    "pe_fair": 22,
    "pe_expensive": 35,
    "pb_cheap": 1.5,
    "roe_strong": 18,
    "div_yield_good": 3.0
  }
}
```

---

### 5.4 Risk Contract

**GET /quant/full?mode=uploaded&period=1y → QuantFullResponse**
```json
{
  "metrics": {
    "annualised_return": 0.142,
    "annualised_volatility": 0.187,
    "sharpe_ratio": 0.76,
    "sortino_ratio": 1.12,
    "max_drawdown": -0.231,
    "beta": 1.08,
    "alpha": 0.031,
    "information_ratio": 0.44,
    "var_95": -0.021
  },
  "performance": {
    "portfolio_cumulative": [[date, value], ...],
    "benchmark_cumulative": [[date, value], ...],
    "drawdown_series": [[date, drawdown], ...]
  },
  "correlation": {
    "tickers": ["TCS", "INFY", "HDFC"],
    "matrix": [[1.0, 0.74, 0.31], [0.74, 1.0, 0.28], [0.31, 0.28, 1.0]]
  },
  "contributions": [
    {"ticker": "TCS", "weight": 0.182, "marginal_risk_contribution": 0.231, "standalone_vol": 0.193}
  ],
  "meta": {
    "period": "1y",
    "valid_tickers": ["TCS", "INFY", "HDFC"],
    "excluded_tickers": ["SOMESMALLCAP"],
    "excluded_reason": {"SOMESMALLCAP": "insufficient price history"},
    "correlation_n": 21,
    "benchmark": "^NSEI",
    "cache_age_seconds": 120,
    "portfolio_usable": true
  }
}
```

---

### 5.5 History Contract

**GET /history/{portfolio_id}/daily → HistoryResponse**
```json
{
  "status": "complete",
  "portfolio_id": 17,
  "period": "1y",
  "data_points": 252,
  "series": [
    {"date": "2025-04-21", "value": 925000.0, "benchmark_value": 100.0},
    {"date": "2025-04-22", "value": 931000.0, "benchmark_value": 100.4}
  ],
  "meta": {
    "base_date": "2025-04-21",
    "base_value": 925000.0,
    "final_value": 1050000.0,
    "total_return": 0.135,
    "benchmark_return": 0.091,
    "build_completed_at": "2026-04-20T13:05:00Z"
  }
}
```

If still building:
```json
{
  "status": "building",
  "portfolio_id": 17,
  "series": [],
  "meta": {"estimated_completion_seconds": 30}
}
```

---

### 5.6 Peers Contract

**GET /peers/{ticker}?mode=uploaded → PeersResponse**
```json
{
  "subject": {
    "ticker": "TCS",
    "name": "Tata Consultancy Services Ltd.",
    "sector": "Information Technology",
    "pe_ratio": 28.4,
    "pb_ratio": 12.1,
    "market_cap": 1380000000000,
    "roe": 48.2,
    "one_year_return": 0.142
  },
  "peers": [
    {
      "ticker": "INFY",
      "name": "Infosys Ltd.",
      "pe_ratio": 24.1,
      "pb_ratio": 7.8,
      "market_cap": 620000000000,
      "roe": 34.5,
      "one_year_return": 0.108,
      "available": true
    },
    {
      "ticker": "WIPRO",
      "available": false,
      "error": "yfinance timeout"
    }
  ],
  "meta": {
    "sector": "Information Technology",
    "peer_count_requested": 5,
    "peer_count_returned": 3,
    "unavailable_peers": ["WIPRO"],
    "data_source": "yfinance",
    "fetched_at": "2026-04-20T13:01:00Z"
  }
}
```

---

### 5.7 Market Contract

**GET /market/overview → MarketOverviewResponse**
```json
{
  "indices": [
    {
      "ticker": "^NSEI",
      "name": "NIFTY 50",
      "last_price": 24350.5,
      "change": 1.24,
      "change_pct": 0.0051,
      "available": true,
      "data_age_seconds": 85
    },
    {
      "ticker": "^NSEMDCP50",
      "name": "NIFTY Midcap 50",
      "available": false,
      "last_known_close": 13200.0,
      "error": "fetch timeout"
    }
  ],
  "sector_performance": [
    {"sector": "Information Technology", "change_pct": 0.0142, "direction": "up"}
  ],
  "movers": {
    "top_gainers": [{"ticker": "IRFC", "change_pct": 0.048}],
    "top_losers": [{"ticker": "ZOMATO", "change_pct": -0.032}]
  },
  "meta": {
    "as_of": "2026-04-20T13:15:00Z",
    "cache_age_seconds": 95,
    "data_freshness": "live",
    "market_open": true
  }
}
```

---

## 6. Cache and Invalidation Model

### Principle

Every cache in the system is a named object with three explicit properties:
1. **Key** — exactly what content it represents.
2. **TTL** — how long it is valid without revalidation.
3. **Invalidation triggers** — events that flush it immediately, regardless of TTL.

"We cache this in a dict" is not acceptable. If you cannot write down the TTL and at least one invalidation trigger, you should not be caching it.

### Cache registry (target state)

| Cache name | Backend location | Key | TTL | Invalidation triggers |
|---|---|---|---|---|
| `portfolio_full` | Redis / in-process fallback | `portfolio_full:{portfolio_id}:{mode}` | 60s (live), 5m (uploaded) | Upload confirm, portfolio switch, holdings edit |
| `quant_metrics` | Redis / in-process fallback | `quant:{portfolio_id}:{mode}:{period}` | 10m (live), 24h (uploaded) | Upload confirm, portfolio switch |
| `price_live` | In-process (acceptable for 1-worker) | `price:{ticker}` | 60s | Never (TTL only) |
| `fundamentals` | In-process + Redis promotion | `fundamentals:{ticker}` | 4h | Manual refresh trigger |
| `market_overview` | In-process | `market_overview` | 2m | Never (TTL only) |
| `benchmark_history` | Redis / in-process | `benchmark:{period}` | 1h | Never (TTL only) |
| `peer_candidates` | In-process | `peers:{ticker}` | 4h | Never (TTL only) |
| `uploaded_holdings` | In-memory list + DB | `portfolio:{portfolio_id}:holdings` | Forever (until next upload) | Upload confirm |

### Cache layer architecture

```
Request arrives at endpoint
  │
  ├── L1: In-process dict (fastest; lost on restart; acceptable for prices)
  │
  ├── L2: Redis (optional; shared across workers; survives restart)
  │         Key: namespaced, TTL-expired
  │         Fallback: if REDIS_URL not set, L2 is skipped
  │
  └── L3: Database (source of truth; always consistent)
            On L1+L2 miss: load from DB, populate L1 and L2
```

### In-memory holdings restoration on restart

On backend startup, if `_uploaded_holdings` list is empty and there is an active `uploaded` portfolio in the DB, `_restore_uploaded_portfolio()` fires synchronously before the server accepts traffic. If it fails, the server starts but all `/portfolio/` endpoints return `503 Service Unavailable — portfolio cache not ready` until a manual re-upload or forced restore.

This failure must be surfaced, not silently swallowed.

---

## 7. Failure-State Philosophy

The system's attitude toward failure determines whether users trust it. The guiding principle:

> **A degraded but honest response is always better than a silent or misleading one.**

### Tier 1: External data provider failures (yfinance, FMP, NewsAPI)

- Always time out per-request (5s per ticker, 12s aggregate max for any endpoint).
- Always include `available: false` + `error: "reason"` for failed items in the response.
- Never drop items from a list silently (a missing holding in the correlation matrix must be called out in `meta.excluded_tickers`).
- Log the failure at WARNING level with ticker + provider + error type.

### Tier 2: Enrichment failures

- Holdings with failed enrichment are still valid holdings. They appear in every page.
- `sector="Unknown"`, `name=ticker_fallback` are valid display values.
- Every enrichment failure is surfaced per-holding in the status endpoint.
- Crash recovery (Step 6 of background enrichment) ensures no holding is stuck at "pending" forever.

### Tier 3: Analytics computation failures

- If quant analytics fails for a portfolio (e.g., all tickers excluded), the response includes `portfolio_usable: false` and a plain-English reason.
- The Risk page shows an honest empty state with the reason ("We could not fetch price history for any of your holdings. Try switching to uploaded mode or check that your tickers are NSE-listed.").
- It never shows a blank white screen with a spinning loader that never resolves.

### Tier 4: Background task failures

- History build failure: `/history/status` returns `{"status": "failed", "error": "reason"}`. The Changes page shows "History unavailable — click to retry" rather than an empty chart.
- Enrichment job failure: surfaced via the status endpoint. A "retry enrichment" button on the upload success page calls `POST /upload/enrich/{portfolio_id}`.
- Quant pre-warm failure: logged at WARNING; the risk page falls back to showing "Loading..." with a cold-cache warning.

### Tier 5: Process restart

- In-memory cache loss is expected and handled (see Section 6).
- The DB is the source of truth. On restart, all in-memory state is restored from DB within 5 seconds.
- If restoration fails, specific error page shown rather than blank dashboard.

### The anti-pattern to eliminate

```python
# BAD — the current pattern in several places
try:
    result = do_expensive_thing()
    logger.warning("Could not do expensive thing (non-fatal): %s", exc)
except Exception:
    pass  # silently succeed with degraded result
```

The logging is there but the failure is swallowed. Replace with: log the failure, return `available: false`, let the frontend display the degraded state honestly.

---

## 8. Beta Scope vs Post-Beta Scope

### Beta scope (everything in Section 2's happy path must work)

| Feature | Status | Gate |
|---|---|---|
| CSV/Excel upload (Zerodha, ICICI, HDFC, Groww exports) | ✅ Exists | End-to-end test with real broker CSVs |
| Portfolio dashboard (full bundle, one HTTP call) | ⚠️ Partial | Risk snapshot and weighted fundamentals must be in bundle |
| Holdings table with enrichment status | ✅ Exists | — |
| Fundamentals with per-ticker timeout + weighted panel | ⚠️ Partial | Per-ticker timeout missing |
| Risk/Quant with explicit exclusion metadata | ⚠️ Partial | `excluded_tickers` not yet in response |
| Changes/Snapshots with daily auto-snapshot | 🚧 Partial | Scheduler not yet wired |
| Advisor (AI + rule-based fallback + disclaimer) | ✅ Exists | Disclaimer footer required |
| Market landing page | ✅ Exists | Graceful degradation needed |
| Watchlist CRUD | ✅ Exists | — |
| Portfolio manager (list, activate, delete) | ✅ Exists | — |
| Peers comparison (with timeout) | ⚠️ Partial | Aggregate timeout missing |
| News (graceful without key) | ✅ Exists | — |
| Enrichment status polling + crash recovery | ✅ Exists | — |
| Empty states on all core pages | ⚠️ Partial | Several pages have no empty state |
| Daily auto-snapshot scheduler | 🚧 Not done | Required for Changes page utility |
| Observability (error reporting + basic metrics) | ❌ Not done | Required before beta invites |
| Legal disclaimers (advisor + fundamentals + risk) | ⚠️ Partial | Advisor footer required |

### Post-beta scope (do not touch these before beta is stable)

| Feature | Why deferred |
|---|---|
| Portfolio optimization (`/optimize`) | Flaky on small portfolios; needs UX work |
| Simulator (`/simulate`) | Mounts expensive hook on load |
| Efficient frontier (`/frontier`) | Scaffold only |
| Broker sync (Zerodha, IBKR) | Months of work; out of MVP |
| Multi-user auth | Out of scope for private beta |
| Redis cache layer | Required only at >1 worker |
| Alembic migrations | Required only when switching to PostgreSQL |
| Tool-use in Advisor | Valuable but not blocking |
| US/EU equity support | NSE-only for MVP |
| Tax/capital gains tracking | Requires transaction history, not snapshot-based |
| Mutual funds | Different data pipeline |
| Real-time price streaming | Polling at 60s is fine for retail |
| Portfolio PDF export | v2 feature |
| Alerts/notifications | No delivery layer yet |

---

## 9. Codebase Disposition: Keep, Rewrite, Isolate, or Hide

### Keep as-is (do not touch without a contract change)

| File/Module | Why keep |
|---|---|
| `app/ingestion/column_detector.py` | Well-implemented fuzzy matcher; stable contract |
| `app/ingestion/normalizer.py` | Clean; handles real-world broker CSV messiness well |
| `app/ingestion/sector_enrichment.py` | Correct fallback chain; per-ticker timeout in place |
| `app/services/upload_v2_service.py` | Solid V2 pipeline; crash recovery just added |
| `app/api/v1/endpoints/upload.py` | Complete; all routes registered |
| `app/models/portfolio.py` | ORM model is correct; no migration needed for beta |
| `app/data_providers/` (all) | Provider pattern is the right abstraction |
| `app/core/config.py` | Pydantic-settings configuration is clean |
| `frontend/src/components/upload/` | Upload wizard components are solid |
| `frontend/src/store/dataModeStore.ts` | Mode state management is correct |

### Patch (keep structure, fix specific bugs)

| File/Module | Patch needed |
|---|---|
| `app/api/v1/endpoints/analytics.py` | Add per-ticker concurrent timeout (ThreadPoolExecutor, 5s per ticker) |
| `app/api/v1/endpoints/peers.py` | Add aggregate timeout (12s hard cap for entire endpoint) |
| `app/services/portfolio_service.py` | Add `risk_snapshot` and `fundamentals_summary` to `/portfolio/full` bundle |
| `app/analytics/quant_service.py` | Add `excluded_tickers` + `excluded_reason` to response meta; add cross-period slice-from-cache logic |
| `app/services/portfolio_manager.py` | Add daily auto-snapshot scheduler (APScheduler) |
| `frontend/src/app/upload/page.tsx` | Minor: add "Retry enrichment" button in done state |
| `frontend/src/app/risk/page.tsx` | Consume `meta.excluded_tickers` from quant response and surface to user |
| `frontend/src/app/fundamentals/page.tsx` | Consume `thresholds` from API response instead of hardcoded TS constants |
| `frontend/src/app/changes/page.tsx` | Add "building" state for history; add scheduler setup prompt |

### Rewrite (current implementation blocks the target state)

| File/Module | Why rewrite | Target replacement |
|---|---|---|
| `frontend/src/lib/risk.ts` | Financial formulas (HHI, diversification score, risk classification) belong in Python | Move to `app/services/risk_snapshot_service.py`; keep only color/label mappings in TS |
| `frontend/src/lib/fundamentals.ts` (compute portion) | `computeWeightedMetrics()` and all thresholds belong in Python | Move to `app/services/fundamentals_view_service.py`; ship thresholds as API response fields |
| `frontend/src/lib/advisor.ts` (business logic) | 7 rule-based analyzers, query routing, and financial heuristics in TS | Move to `app/services/advisor_rule_engine.py`; advisor page becomes display-only |
| `frontend/src/hooks/usePortfolio.ts` (pattern) | Per-page hook fires redundant HTTP calls | Replace with shared `PortfolioContext` mounted at AppShell level |
| `app/db/init_db.py` (migration section) | Manual `ALTER TABLE` won't survive PostgreSQL | Replace with Alembic (post-beta, not blocking) |

### Isolate (working, but dependencies need to be cleaned up)

| File/Module | Isolation needed |
|---|---|
| `frontend/src/app/optimize/page.tsx` | Remove `useOptimization` auto-mount on page load; replace with "Run Optimization" button trigger |
| `frontend/src/app/simulate/page.tsx` | Same as optimize; lazy-load expensive computation |
| `app/api/v1/endpoints/quant.py` | The `/quant/full` endpoint bundles too many concerns; eventually split into `/quant/metrics`, `/quant/performance`, `/quant/correlation` with a composition endpoint that calls all three |

### Hide from navigation (accessible by direct URL, not linked)

- `/optimize` — keep in codebase, remove from nav
- `/simulate` — keep in codebase, remove from nav
- `/frontier` — keep in codebase, remove from nav
- `/brokers` — keep in codebase, remove from nav
- `/screener` — audit before exposing; currently hidden

### Delete entirely

- `frontend/src/app/ai-chat/` — superseded by `/advisor`; nav link already removed
- `frontend/src/app/sectors/` — redundant with dashboard allocation donut; nav link already removed
- Any `mode === 'mock'` branches in the frontend — mock mode was removed in Phase 2; dead code

---

## 10. Recommended Phased Path to Target State

Phases are ordered by dependency and user impact. Each phase is independently shippable.

### Phase 0 — Stop the bleeding (1 week, before anything else)
*Non-negotiable fixes that actively break UX today.*

1. Add per-ticker timeout (5s) on `GET /analytics/ratios` using `concurrent.futures.ThreadPoolExecutor`.
2. Add aggregate hard timeout (12s) on `GET /peers/{ticker}`.
3. Delete `frontend/src/app/ai-chat/` and `frontend/src/app/sectors/`.
4. Remove `/optimize`, `/simulate`, `/frontier`, `/brokers` from sidebar navigation.
5. Enforce 10MB file size limit on upload endpoints.
6. Add disclaimer footer component to `/advisor` response cards.
7. Audit and remove dead `mode === 'mock'` branches in frontend.

**Gate to Phase 1:** All core pages load without blank screens or >10s hangs on a 20-holding portfolio.

---

### Phase 1 — Backend owns intelligence (2 weeks)
*Moves financial computation from TypeScript to Python. Biggest architectural payoff.*

1. Implement `app/services/risk_snapshot_service.py::compute_risk_snapshot(holdings, sectors) -> RiskSnapshot`.
   - Computes HHI, top1/top3 weights, sector count, risk classification ("low"/"moderate"/"concentrated"), diversification score.
   - Output exactly matches the `risk_snapshot` shape in Section 5.2.
2. Implement `app/services/fundamentals_view_service.py::compute_weighted_fundamentals(holdings, ratios) -> FundamentalsSummary`.
   - Ships thresholds as constants; includes them in the API response.
3. Add `risk_snapshot` and `fundamentals_summary` to `GET /portfolio/full` response bundle.
4. Delete `computeRiskSnapshot()` from `frontend/src/lib/risk.ts`. Keep only color/label display mappings.
5. Delete `computeWeightedMetrics()` from `frontend/src/lib/fundamentals.ts`. Frontend reads from API response.
6. Update `/risk` dashboard card and `/fundamentals` weighted panel to consume backend-provided values.

**Gate to Phase 2:** `python -c "from app.services.risk_snapshot_service import compute_risk_snapshot; ..."` passes numeric assertions against known portfolio outputs. No `Math.sqrt` in core frontend files.

---

### Phase 2 — Single-fetch portfolio context (1 week)
*Eliminates redundant HTTP calls. Every page navigation is instant after first load.*

1. Create `PortfolioContext` React context provider with:
   - State: `{ data: PortfolioFullResponse | null, loading, error, mode, portfolioId }`
   - Fetch: single call to `GET /portfolio/full` per `(mode, portfolioId)` combination.
   - Invalidation: on upload confirm, mode toggle, portfolio activate.
2. Mount `PortfolioContext` in the AppShell layout (wraps all pages).
3. Replace all per-page `usePortfolio()` hook instances with `useContext(PortfolioContext)`.
4. Verify: navigating from `/dashboard` to `/holdings` to `/risk` triggers zero additional HTTP calls to `/portfolio/full`.

**Gate to Phase 3:** Chrome DevTools network panel shows exactly one `/portfolio/full` call per user session (plus one per invalidation event).

---

### Phase 3 — History and snapshot reliability (1 week)

1. Wire `APScheduler` (or equivalent) to create a daily auto-snapshot at 9:00 PM IST for the active uploaded portfolio.
2. Add `GET /history/{portfolio_id}/status` endpoint.
3. Add "building" empty state to `/changes` that polls status and shows ETA.
4. Implement `GET /history/{portfolio_id}/daily` returning the full daily value series (time series chart on Changes page).
5. Ensure history build is retried on process restart if it was `"building"` when the process died.

**Gate to Phase 4:** A portfolio uploaded at time T has a daily history entry by 9:05 PM IST the same day. The Changes page shows a chart after day 2.

---

### Phase 4 — Quant analytics reliability (1 week)

1. Add `excluded_tickers` and `excluded_reason` to `GET /quant/full` response meta.
2. Implement cross-period slicing: download 2 years of price history once; serve 1y/6m/3m/1m requests by slicing the cached matrix.
3. Surface excluded tickers on the `/risk` page ("3 holdings were excluded from quant analytics — click to see why").
4. Add `GET /quant/status` endpoint surfacing cache age and warm/cold state.

**Gate to Phase 5:** A holding excluded from quant analytics is visible to the user with an explanation. Period switching does not re-trigger a full yfinance download.

---

### Phase 5 — Observability (1 week, before beta invites)

1. Wire Sentry (or equivalent) to both backend (FastAPI exception handler) and frontend (Next.js error boundary).
2. Add endpoint latency logging: p50/p95/p99 per endpoint per day, written to a structured log.
3. Add cache hit rate logging per cache name.
4. Wire health check (`GET /health`) and readiness check (`GET /readiness`) to hosting platform's health monitoring.
5. Ensure no PII (portfolio contents, holdings, user-entered data) appears in any log.
6. Set up automated SQLite backup (daily `cp` to a cloud storage bucket; one-liner).

**Gate to beta invites:** Error reporting is live and alerts on exception rate >0.5% over 1h. Latency dashboards visible.

---

### Phase 6 — Advisor rebuild (post-beta, when advisor usage data is available)

1. Move all rule-based analysis logic from `frontend/src/lib/advisor.ts` to `app/services/advisor_rule_engine.py`.
2. Add conversation persistence: `advisor_conversations` table; `GET /advisor/history`.
3. Add tool-use: `get_fundamentals(ticker)`, `get_peers(ticker)`, `simulate_rebalance(target_weights)`.
4. Version the prompt library in `app/services/advisor_prompts/`.
5. Add per-session query cap (configurable via settings).

---

## 11. UI/UX Principles for a Finance-Native Premium Product

These are design constraints, not features. Every UI decision should respect them.

### 11.1 Data quality is always visible

The user must always know the quality of the data they are looking at. This means:
- Every metric card shows its data source (`from_file`, `yfinance`, `estimated`).
- Every enrichment-incomplete holding shows an indicator (amber dot, not silent gap).
- Every quant metric that excluded holdings shows how many were excluded.
- "Loading" states are time-bounded — after 10 seconds, they become error states with an explanation, never perpetual spinners.

### 11.2 One number, one truth

A given metric (e.g. "portfolio PE") appears once on the page. Not once in the summary card and once in the weighted panel, recomputed independently. Not once from the backend and once recomputed client-side. The backend computes it. The frontend renders it. If the numbers conflict, it's a bug.

### 11.3 Silence is a lie

Blank states, empty tables, and missing charts must always explain themselves:
- "No portfolio uploaded yet. [Upload now →]"
- "Price history unavailable for 3 holdings. [See why →]"
- "Enrichment still in progress. Estimated 20s remaining."

A blank chart that looks like it loaded successfully is worse than an error message.

### 11.4 Disclaimer is non-negotiable, but not a wall

Every financial insight from the advisor includes a one-line disclaimer at the footer. This disclaimer is never the most prominent element on the screen — it sits below the insight, not above it. The legal requirement is met without making the product feel paranoid. The user came for insights, not warnings.

### 11.5 Speed is a feature

- Dashboard must render its core content (KPI tiles, allocation donut, holdings table preview) in under 1 second from cached data.
- The user should never perceive a "loading" state when returning to a page they have already visited.
- Expensive operations (quant, optimization) are pre-warmed after upload so the first page visit to `/risk` uses the cache.
- Perceived speed matters as much as actual speed: show skeleton states immediately, populate as data arrives, never show a blank page while waiting.

### 11.6 Context persistence across navigation

- Scrolling to row 15 of the holdings table, navigating to fundamentals, and coming back should return to the same scroll position.
- The selected time period on the risk page persists within a session.
- Mode toggle (uploaded/live) persists in localStorage and survives page refreshes.
- The last active portfolio persists in localStorage.

### 11.7 Progressive disclosure

- The most important information is visible without scrolling: KPI tiles, sector donut, top 5 holdings.
- Secondary information (full correlation matrix, enrichment details, weighted fundamentals breakdown) is in expandable panels, not blocking the primary view.
- Expert information (quant metrics, drawdown series, marginal risk contribution per holding) is available but not forced on casual users.

### 11.8 Finance-native language, not generic SaaS language

- "Holdings" not "positions" (common to all users, not just traders).
- "Average cost" not "cost basis" (clear to retail investors).
- "Sector allocation" not "portfolio composition."
- "P&L" not "profit/loss." The abbreviation is universally understood.
- "Enrichment" is an internal term — users see "data availability" or "market data status."
- Numbers use Indian numbering format where relevant (₹12,45,000 not ₹1,245,000) or international format with ₹ prefix consistently applied.

### 11.9 Status dots have one language

Across every page in the system, these are the only colors used for status:
- 🟢 Green / emerald: enriched, available, complete, up.
- 🟡 Amber: partial, in-progress, warning, degraded.
- 🔴 Red: failed, unavailable, error, down.
- ⚪ Grey: pending, unknown, never attempted.

This color language must be consistent from the upload enrichment table to the market overview chips to the fundamentals availability badge.

---

## 12. Specific Anti-Patterns to Avoid in Future Edits

These are the patterns that have caused the most pain in the current codebase. Treat them as hard rules.

---

### Anti-pattern 1: Financial formulas in TypeScript

**Example in current code:**
```typescript
// frontend/src/lib/risk.ts
const hhi = holdings.reduce((sum, h) => sum + Math.pow(h.weight, 2), 0)
const diversificationScore = Math.round((1 - hhi) * 100)
```

**Why it's wrong:** Formula changes require a frontend deploy. Duplicates Python equivalents. Untestable with financial test fixtures. Creates two sources of truth.

**Rule:** If a TypeScript file contains a mathematical operation on financial data (weights, returns, ratios, scores, thresholds), move it to Python. The only acceptable exception is visual transformations (chart scale, color interpolation).

---

### Anti-pattern 2: Per-page API calls for shared data

**Example in current code:**
```typescript
// Every page that needs holdings:
const { holdings, loading } = usePortfolio()
// This fires GET /portfolio/full on every page mount
```

**Why it's wrong:** Navigating from `/dashboard` to `/holdings` to `/risk` fires 3 identical HTTP calls. 30–40% unnecessary network traffic. Causes brief stale-state flicker on navigation.

**Rule:** Data that is shared across pages lives in a context provider mounted at AppShell level, not a hook mounted per-page. Per-page hooks are for page-specific data only (e.g. `/peers/{ticker}` is genuinely per-page).

---

### Anti-pattern 3: Swallowing exceptions silently in background tasks

**Example in current code:**
```python
try:
    result = expensive_external_call()
except Exception as exc:
    logger.warning("Could not do thing (non-fatal): %s", exc)
    # continue as if nothing happened
```

**Why it's wrong:** The failure is logged but the state is now inconsistent. Holdings stay at `enrichment_status="pending"` forever. Users get perpetual spinners. The crash recovery logic exists precisely to handle this — use it.

**Rule:** Catch exceptions in background tasks, log them, and resolve state. Either set an explicit error status (`"failed"` + `failure_reason`) or re-raise. Never silently succeed with degraded state.

---

### Anti-pattern 4: Adding endpoints without defining the contract first

**Example of the wrong approach:**
> "I need the portfolio page to also show the last snapshot date. I'll add a `last_snapshot_at` field to `/portfolio/full`."

Then three months later:
> "I need last_snapshot_at for the advisor context too. I'll add it to `/advisor/ask`."

And then:
> "Actually the field means something slightly different in each context."

**Why it's wrong:** Endpoints grow unbounded. Contracts drift. Consumers disagree on what fields mean.

**Rule:** Before adding a field to an API response, update the canonical contract in this document first. If the field belongs in an existing contract, add it there. If it represents a genuinely new concern, create a new endpoint with its own contract. Never add fields to responses to solve a single page's need.

---

### Anti-pattern 5: Eager-loading expensive computations on page mount

**Example in current code:**
```typescript
// frontend/src/app/optimize/page.tsx
const { data, loading } = useOptimization()  // fires on mount; takes 15s cold
```

**Why it's wrong:** Users land on the optimization page to explore, not to immediately run an optimization. The page mount triggers a 15-second cold computation regardless. Slows navigation across the whole app.

**Rule:** Expensive computations (quant, optimization, history build) must be triggered by explicit user action (button click, time-period selector change), not page mount. The page renders a "ready" state immediately; the computation fires when requested.

---

### Anti-pattern 6: Hardcoded financial thresholds in frontend constants

**Example in current code:**
```typescript
// frontend/src/lib/fundamentals.ts
const PE_CHEAP = 12
const PE_EXPENSIVE = 30
const ROE_STRONG = 18
```

**Why it's wrong:** The backend may use different thresholds. If sector-specific thresholds are added later (banks have different PE norms), the frontend cannot receive them dynamically. Changing thresholds requires a frontend deploy.

**Rule:** Thresholds are owned by the backend. The API response ships them as `thresholds: { pe_cheap: 12, pe_expensive: 30, ... }`. The frontend reads and applies them; it never defines them.

---

### Anti-pattern 7: No empty state on a page that can have no data

**Example of the wrong behaviour:**
> `/changes` page mounts with zero snapshots → renders an empty chart with no explanation → user thinks the page is broken.

**Why it's wrong:** Users cannot distinguish between "loading", "no data", "feature not available", and "error" when the page is silent.

**Rule:** Every page that depends on data that may be absent must have an explicit empty state with:
1. A plain-English explanation of why there's no data.
2. A call-to-action that resolves the situation (upload, create snapshot, wait for enrichment).

No page is allowed to render a blank area without an explanation.

---

### Anti-pattern 8: Two sources of truth for active portfolio

**Example in current code:**
- Backend: `Portfolio.is_active` column in DB.
- Frontend: `portfolioStore.activePortfolioId` in Zustand.

These can drift. If a user opens two tabs and switches portfolio in one, the other shows stale data.

**Rule:** The active portfolio state is owned by the backend (`PUT /portfolios/{id}/activate`). The frontend `portfolioStore` is a cache of the backend state, not an independent authority. On every portfolio-dependent fetch, the active portfolio ID is read from the URL or from a fresh `GET /portfolios/active` call, not assumed from Zustand.

---

## Appendix A: Module Dependency Map (Target State)

```
Browser
  │
  └─ AppShell (PortfolioContext provider)
       │
       ├─ GET /portfolio/full  (once per session per mode/portfolio change)
       │     └─ pre-computes: holdings, summary, sectors, risk_snapshot, fundamentals_summary
       │
       ├─ /market       → GET /market/overview          (independent, 2m cache)
       ├─ /upload       → POST /upload/parse, /v2/confirm, GET /upload/status
       ├─ /dashboard    → PortfolioContext (no additional calls)
       ├─ /holdings     → PortfolioContext (no additional calls)
       ├─ /fundamentals → PortfolioContext + GET /analytics/ratios
       ├─ /risk         → PortfolioContext + GET /quant/full
       ├─ /peers        → GET /peers/{ticker} (per-holding, on demand)
       ├─ /changes      → GET /portfolios/{id}/snapshots + GET /history/{id}/daily
       ├─ /news         → GET /news/full
       ├─ /advisor      → PortfolioContext + POST /advisor/ask
       ├─ /watchlist    → GET /watchlist/ (CRUD)
       └─ /portfolios   → GET /portfolios/ (management only)
```

---

## Appendix B: Codebase Scorecard (Current vs Target)

| Dimension | Current grade | Target grade | What closes the gap |
|---|---|---|---|
| Backend layering | B+ | A | Phase 1 moves intelligence; Phase 2 cleans context |
| Frontend data-fetching | C | A- | Phase 2 (AppShell context) |
| Financial logic location | D | A | Phase 1 (move to backend) |
| Error transparency | C+ | A | Phases 0+1 (exclusion metadata, crash recovery) |
| Cache strategy | C- | B+ | Phase 5 + Redis (post-beta) |
| Empty states | C | A- | Phase 0 + design system pass |
| Observability | F | B | Phase 5 (Sentry + metrics) |
| Test coverage | Unknown | B | Add per-phase; contract tests first |
| Schema migrations | D | B+ | Alembic (post-beta, pre-Postgres) |
| Upload pipeline | A- | A | Phase 0 polish only |
| Provider pattern | B | A- | Formalize contract; document required vs optional fields |
| API contract stability | C | A | This document + PR review against contracts |

---

*Document version: 1.0, April 2026.*
*Owner: P-Insight lead engineer.*
*Review cycle: Update when a module contract changes or a new phase begins.*
*Do not treat this as a to-do list. Treat it as a constraint system that every PR must respect.*
