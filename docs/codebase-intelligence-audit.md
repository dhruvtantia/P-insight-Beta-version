# P-Insight — Codebase Intelligence Audit

**Date:** April 2026  
**Status:** Post Phase-2 upload hardening  
**Auditor:** Engineering self-audit (AI-assisted, full codebase read)  
**Companion docs:** `01-architecture-and-design.md`, `02-status-and-backlog.md`, `feature-dependency-map.md`, `refactor-backlog.md`

---

## 1. Executive Summary

P-Insight is a well-intentioned, reasonably structured codebase. The data provider pattern is clean, the enrichment pipeline is correct, and the most expensive computations (quant analytics, optimization) are properly offloaded to the backend with server-side caching. Phase 2 hardening has improved upload reliability.

However, the codebase has a consistent architectural weakness: **frontend pages make too many small, independent API calls, and the backend has no bundled endpoints to serve them efficiently.** The result is unnecessary load waterfalls, pages that fetch data they don't use, and frontend code that performs financial computation it should not own.

There are also several areas of silent failure — yfinance drops tickers without surfacing a warning, quant analytics excludes holdings from correlation matrices without telling the user, and the data mode transition has no holding state, causing brief emptiness on every page during mode switches.

None of these are catastrophic. But together they make the app feel slower and less trustworthy than its underlying architecture deserves.

**Top 5 issues by severity:**

1. `usePortfolio()` triggers 3 separate API calls on every page load — should be one bundled call
2. Financial math (weighted PE, weighted ROE, sector weighting) is scattered across frontend hooks — belongs entirely in the backend
3. Silent ticker exclusion in quant/analytics — user cannot tell if their analytics are complete or partial
4. Advisor page fetches watchlist, snapshots, and fundamentals on mount unconditionally — most are never used for a given query
5. Cross-period quant caching is missing — switching between 1y/6m/3m triggers full recomputes instead of slicing

---

## 2. Current Architecture Overview

### Stack summary

```
Frontend:  Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand
Backend:   FastAPI (Python), SQLAlchemy 2.x, SQLite, Pydantic v2
Data:      yfinance (prices + fundamentals), FMP API (peers + fundamentals), NewsAPI
Compute:   PyPortfolioOpt (optimization), scipy (covariance), pandas (history)
```

### Request flow (simplified)

```
Browser page load
  → React component mounts
  → custom hook fires (usePortfolio, useFundamentals, useQuantAnalytics, ...)
  → hook calls services/api.ts → apiFetch() → FastAPI endpoint
  → endpoint calls DataProvider or Service
  → DataProvider hits DB or external API (yfinance, FMP)
  → response flows back: endpoint → hook → component state → render
```

### Data modes

The app operates in one of three data modes, controlled by `useDataModeStore` (Zustand, persisted to localStorage):

| Mode | Data source | When used |
|------|-------------|-----------|
| `uploaded` | SQLite DB (uploaded CSV) | After CSV upload — primary beta mode |
| `live` | yfinance + FMP API | Live market prices for any portfolio |
| `broker` | Scaffold only | Not yet implemented |

**Mode is passed as a query parameter to almost every backend endpoint.** All hooks subscribe to mode changes and re-fetch when it changes.

### Persistence layers

| Layer | What's stored | Lifetime |
|-------|--------------|----------|
| SQLite (`p_insight.db`) | Portfolios, Holdings, Snapshots, PortfolioHistory | Persistent |
| `_uploaded_holdings` (module-level list) | In-memory copy of active uploaded portfolio | Process lifetime; reloaded from DB on startup |
| Quant cache (`_QUANT_CACHE` dict) | Computed analytics per mode+period | 10 min (live), 24h (mock); process lifetime |
| Fundamentals cache | Per-ticker yfinance fundamentals dict | Process lifetime |
| Browser localStorage | `dataMode`, `dataModeStore` | Persistent across sessions |

---

## 3. Frontend Structure Map

```
frontend/src/
├── app/
│   ├── dashboard/page.tsx        Uses: usePortfolio (3 calls), commentary (1 call)
│   ├── holdings/page.tsx         Uses: usePortfolio (3 calls)
│   ├── fundamentals/page.tsx     Uses: usePortfolio (3 calls), useFundamentals (1 call)
│   ├── risk/page.tsx             Uses: usePortfolio (3 calls), useQuantAnalytics (1 call)
│   ├── changes/page.tsx          Uses: useSnapshots, useDelta — chart-heavy
│   ├── peers/page.tsx            Uses: usePortfolio (3 calls), usePeerComparison (1 call per ticker)
│   ├── news/page.tsx             Uses: usePortfolio (3 calls!), useNews (2 calls)
│   ├── market/page.tsx           Uses: useMarket (multiple calls)
│   ├── advisor/page.tsx          Uses: usePortfolio (3), useFundamentals (1), useWatchlist (1),
│   │                                   useSnapshots (1), advisorApi.status (1)
│   ├── optimize/page.tsx         Uses: useOptimization (1 call)
│   ├── simulate/page.tsx         Uses: useSimulation, simulationStore
│   ├── upload/page.tsx           Upload wizard — 4-step flow
│   └── watchlist/page.tsx        Uses: useWatchlist (1 call), useLiveData
│
├── hooks/
│   ├── usePortfolio.ts           CORE — 3 parallel calls on every page load
│   ├── useFundamentals.ts        1 call; client-side merge + weighted math (PROBLEM)
│   ├── useQuantAnalytics.ts      1 call; server-cached; period-triggered re-fetch
│   ├── useOptimization.ts        1 call; expensive; parameter-sensitive
│   ├── usePeerComparison.ts      1 call per selected ticker; no cross-ticker cache
│   ├── useNews.ts                2 calls (articles + events — should be 1)
│   ├── useAdvisor.ts             6+ calls on mount; regex-based optimization detection
│   ├── useSnapshots.ts           1 call to list snapshots
│   ├── useDelta.ts               1 call per (A,B) pair; module-level cache (good)
│   ├── useWatchlist.ts           1 call; no caching
│   ├── useLiveData.ts            1 call; no caching on frontend
│   └── useMarket.ts              Multiple calls; market-specific
│
├── store/
│   ├── dataModeStore.ts          PERSISTED — controls all data fetching mode
│   ├── portfolioStore.ts         Active portfolio ID + metadata; not persisted
│   ├── simulationStore.ts        Session-only sim holdings; clears on portfolio switch
│   └── filterStore.ts            UI filter state (not data)
│
├── components/
│   ├── upload/                   UploadDropzone, ColumnMapper, PortfolioPreviewTable
│   ├── portfolio/                PortfolioHistoryChart, KPI tiles
│   ├── layout/                   Sidebar, Topbar, AppShell
│   ├── modules/                  HoldingsTable, SectorChart, RiskMetrics, etc.
│   └── common/                   DataModeToggle, LoadingState, ErrorBoundary
│
└── services/
    └── api.ts                    apiFetch() — central fetch wrapper; all hooks use this
```

### Key observations on frontend structure

- `usePortfolio` is called by **8 out of 12 pages**. It makes 3 API calls every time. That is 24 API calls just for portfolio data across a typical session.
- `useFundamentals` performs financial computation (weighted PE, weighted ROE, sector-weight-adjusted metrics) that strictly belongs on the backend.
- `useNews` makes 2 calls for data that is conceptually one resource.
- `useAdvisor` unconditionally loads 4 different data sources on mount before any query is sent.
- The `computeRiskSnapshot()` function is called client-side on the Dashboard and Risk pages independently — the same calculation, in two places.

---

## 4. Backend Structure Map

```
backend/app/
├── api/v1/endpoints/
│   ├── portfolio.py              GET /portfolio/, /summary, /sectors — 3 SEPARATE endpoints
│   ├── analytics.py              GET /analytics/ratios, /commentary, /risk (scaffold)
│   ├── quant.py                  GET /quant/full, /status
│   ├── optimization.py           GET /optimization/full, /status
│   ├── peers.py                  GET /peers/{ticker}
│   ├── news.py                   GET /news/, /events — 2 SEPARATE endpoints
│   ├── advisor.py                GET /advisor/status, POST /advisor/ask, GET /advisor/context
│   ├── snapshots.py              CRUD for portfolio snapshots
│   ├── upload.py                 POST /upload/parse, /upload/confirm
│   ├── live.py                   GET /live/quotes, /fundamentals, /status
│   ├── market.py                 GET /market/overview, /sectors, /movers
│   ├── history.py                GET /portfolio/history, /benchmark/history
│   ├── watchlist.py              CRUD for watchlist
│   └── simulate.py               GET /simulate/rebalance (Tier 3, hidden)
│
├── data_providers/
│   ├── base.py                   BaseDataProvider interface
│   ├── mock_provider.py          Seeded deterministic data from portfolio.json
│   ├── file_provider.py          In-memory cache of uploaded CSV data; proxies to yfinance
│   ├── live_provider.py          yfinance prices, FMP fundamentals, peer candidates
│   └── broker_provider.py        Scaffold; not implemented
│
├── services/
│   ├── portfolio_manager.py      save/patch holdings in DB; enrichment metadata patching
│   ├── portfolio_service.py      holdings/summary/sectors aggregation from DB
│   ├── snapshot_service.py       snapshot creation/comparison/delta computation
│   ├── history_service.py        portfolio daily value history + benchmark; DB-persisted
│   └── advisor_service.py        context building + LLM call + fallback logic
│
├── ingestion/
│   ├── column_detector.py        Alias-based fuzzy column detection
│   ├── normalizer.py             Row normalization; numeric + ticker + date cleaning
│   └── sector_enrichment.py     yfinance → FMP → static map → "Unknown" fallback chain
│
├── analytics/
│   ├── quant_service.py          Sharpe, vol, drawdown, correlation, beta, contributions
│   └── optimization_service.py   Mean-variance optimization via PyPortfolioOpt
│
├── models/
│   ├── portfolio.py              Portfolio, Holding ORM models (enrichment metadata columns)
│   ├── snapshot.py               PortfolioSnapshot model
│   ├── history.py                PortfolioHistory, BenchmarkHistory models
│   └── watchlist.py              WatchlistItem model
│
└── schemas/
    ├── portfolio.py              HoldingBase, HoldingResponse, PortfolioSummary, SectorAllocation
    ├── analytics.py              QuantResult, OptimizationResult
    └── advisor.py                AdvisorQuery, AdvisorResponse
```

### Key observations on backend structure

- The portfolio endpoint family (`/portfolio/`, `/portfolio/summary`, `/portfolio/sectors`) maps to three separate DB queries and three round trips. They should be one.
- `portfolio_service.py` already has `get_holdings()`, `get_summary()`, `get_sector_allocation()` as separate methods — trivial to bundle them into a `get_full()` method.
- `quant_service.py` is the most expensive code in the entire project. It is correctly cached but has no cross-period optimisation (see Section 7).
- `advisor_service.py` builds a full context payload on every single `/advisor/ask` call, even for trivial queries like "what's my total invested value?"
- The `live_provider.py` has silent fallbacks for missing tickers that never surface a warning to the frontend.

---

## 5. Feature-to-Feature Dependency Map

*(Full map also in `feature-dependency-map.md`)*

```
CSV Upload
  └─► ingestion pipeline (column_detector → normalizer → sector_enrichment)
        └─► DB persistence (Portfolio + Holding rows)
              └─► in-memory FileDataProvider cache
                    └─► ALL portfolio endpoints (mode=uploaded)
                          ├─► Dashboard (holdings + summary + sectors)
                          ├─► Holdings page
                          ├─► Fundamentals (holdings + /analytics/ratios)
                          ├─► Risk (holdings + /quant/full)
                          ├─► Peers (holdings + /peers/{ticker})
                          ├─► News (holdings → ticker chips → /news/)
                          ├─► Changes (holdings → snapshots → delta)
                          └─► Advisor (holdings + fundamentals + watchlist + snapshots)

Portfolio Snapshot (manual or auto)
  └─► snapshot_service.py → DB (PortfolioSnapshot)
        └─► Changes page (snapshot list → select two → /snapshots/delta)
              └─► Delta computation (sector shift, holding shift, value shift)
                    └─► Advisor context (snapshot summary included)

Portfolio History (background task, post-upload)
  └─► history_service.py → yfinance (1y daily prices per ticker + benchmark)
        └─► DB (PortfolioHistory, BenchmarkHistory)
              └─► Changes page (daily value chart)

Quant Analytics (triggered by Risk or Advisor page)
  └─► quant_service.py → yfinance (price histories)
        └─► In-memory cache (_QUANT_CACHE)
              └─► /quant/full → Risk page
              └─► /advisor/ask (include_optimization=true)

Optimization (triggered by Optimize page or Advisor)
  └─► optimization_service.py → price histories (reused from quant if cached)
        └─► In-memory cache
              └─► /optimization/full → Optimize page

Market
  └─► live_provider.py → yfinance (indices + sector ETFs)
        └─► /market/overview, /market/sectors, /market/movers
              └─► Market page (standalone — no portfolio dependency)
```

### Critical coupling points

- **Upload → all downstream pages:** Every analytics page depends on holdings being in the DB or in-memory cache. If the in-memory `_uploaded_holdings` list is lost (process restart without DB restore), pages are empty until upload is re-run.
- **DataMode → all hooks:** Mode change triggers simultaneous re-fetch in every mounted hook. No transition buffering.
- **yfinance → quant → Risk page:** If yfinance is unavailable or slow, the Risk page is essentially broken. No fallback analytics for uploaded portfolio without live prices.
- **Changes page → PortfolioHistory:** If the background history build fails (e.g., yfinance timeout during upload), the daily chart on the Changes page will be empty with no explanation.

---

## 6. Data Flow Map

### Portfolio data flow (most common path)

```
User visits /dashboard (uploaded mode)

1. usePortfolio() fires:
   → GET /portfolio/?mode=uploaded
   → GET /portfolio/summary?mode=uploaded
   → GET /portfolio/sectors?mode=uploaded

   Backend (per call):
   → PortfolioService.get_holdings(db, provider)
     → DB query: SELECT * FROM holdings WHERE portfolio_id = active
     → For each holding: compute market_value = current_price * quantity
     → Return HoldingResponse[]

2. useFundamentals(holdings) fires (after holdings load):
   → GET /analytics/ratios?mode=uploaded

   Backend:
   → For each holding: fetch/cache yfinance fundamentals
   → Return FinancialRatios[]

   Frontend (in hook):
   → mergeWithFundamentals(holdings, ratios)  ← join logic
   → computeWeightedMetrics(merged)           ← FINANCIAL MATH on frontend

3. Non-blocking: GET /analytics/commentary?mode=uploaded
```

### Enrichment data flow (upload time)

```
POST /upload/confirm
  → normalize_to_holdings(df, mapping)
  → save_uploaded_portfolio(holdings) → DB insert
  → enrich_holdings(holdings):
      for each holding:
        → yfinance (5s timeout per ticker)
        → FMP API (if key set)
        → static sector/name map
        → "Unknown" fallback
  → patch_holdings_enrichment(portfolio_id, records) → DB update
  → batch price fetch → DB update current_price
  → update _uploaded_holdings in-memory cache
  → background: pre_warm_cache() (quant analytics)
  → background: build_and_store_portfolio_history() (1y prices)
```

### Quant analytics flow

```
GET /quant/full?period=1y&mode=uploaded

  Backend:
  1. Check _QUANT_CACHE[f"uploaded_1y"] → cache hit → return immediately
  
  On cache miss:
  2. Get holdings from provider
  3. For each ticker: yfinance.download(ticker, period="1y")
     → each download: ~2-5s, parallel via ThreadPoolExecutor
  4. Build price matrix (date × ticker)
  5. Compute:
     - Returns, volatility, Sharpe ratio
     - Maximum drawdown + drawdown periods
     - Correlation matrix (nxn)
     - Beta vs Nifty 50 benchmark
     - Marginal risk contributions
  6. Cache result (10 min TTL for live, 24h for mock)
  7. Return QuantResult dict
```

---

## 7. Redundancies and Inefficiencies

### 7.1 Three portfolio endpoints called independently

**Files:** `usePortfolio.ts`, `portfolio.py`

Every page that uses `usePortfolio()` fires three parallel requests:
```
GET /portfolio/         → holdings[]
GET /portfolio/summary  → { total_value, total_invested, pnl, ... }
GET /portfolio/sectors  → { sector_name, weight, value }[]
```

The backend already has `PortfolioService` methods for all three. Combining them into a single `/portfolio/full` endpoint would cut the per-page portfolio load from 3 round trips to 1 with zero logic change. This affects 8 out of 12 pages.

### 7.2 Financial math on the frontend

**File:** `frontend/src/hooks/useFundamentals.ts`, `frontend/src/lib/fundamentals.ts`

`computeWeightedMetrics()` computes portfolio-weighted PE, PB, ROE, and EV/EBITDA ratios on the frontend using holdings weight data. This is financial computation with a non-trivial formula (`Σ(weight_i * metric_i)`) and it lives in a React hook. The same logic should be computed once on the backend and sent as part of the `/analytics/ratios` response. Right now the backend sends raw per-ticker ratios; the frontend aggregates them. This means:
- Any bug in the weighting formula is invisible to backend tests
- The calculation re-runs on every component render that subscribes to the hook
- If we ever add another page that needs weighted metrics, it will duplicate this code again

### 7.3 computeRiskSnapshot() called twice, independently

**Files:** `dashboard/page.tsx`, `risk/page.tsx`

`computeRiskSnapshot()` (concentration HHI, top-holding weight, sector diversity) is a pure function called independently on the Dashboard and Risk pages. It's a cheap calculation but it's duplicated — if the formula ever changes, both pages need updating.

### 7.4 Two news endpoints for one conceptual resource

**Files:** `useNews.ts`, `news.py`

```typescript
const [newsRes, eventsRes] = await Promise.all([
  newsApi.getNews(mode, params),
  newsApi.getEvents(mode, params),
])
```

The backend has `GET /news/` and `GET /news/events` as separate routes. Both accept the same parameters, target the same holdings list, and are always fetched together. This is two round trips for one page's worth of data.

### 7.5 Advisor loads data it may never use

**File:** `useAdvisor.ts`

The advisor hook fetches on mount:
- `usePortfolio()` — 3 calls (needed for most queries)
- `useFundamentals()` — 1 call (needed for ratio questions)
- `useWatchlist()` — 1 call (rarely needed)
- `useSnapshots()` — 1 call (only needed if user asks about history)
- `advisorApi.status()` — 1 call (needed)

That's 6 API calls before the user has typed anything. For a query like "what is my total invested value?", the watchlist and snapshot data are loaded and never used.

### 7.6 News page fetches full portfolio just for ticker chips

**File:** `news/page.tsx`

```typescript
const { holdings } = usePortfolio()  // 3 API calls
// Used only to populate the ticker filter chips at the top
```

The News page calls `usePortfolio()` exclusively to get the list of tickers for the filter UI. It doesn't use sectors, summary, or any holding detail. Three API calls to render a row of chip buttons.

### 7.7 No cross-period caching for quant analytics

**File:** `quant_service.py`

The quant cache key is `f"{mode}_{period}"`. When a user views the Risk page with 1y data, then switches to 6m, then back to 1y:
- First visit (1y): full yfinance fetch (~15-30s for a 20-holding portfolio)
- Switch to 6m: full yfinance re-fetch (same tickers, shorter window)
- Back to 1y: cache hit — instant

The 6-month window is a **subset** of the 1-year data already fetched. The entire price download could be done once for 2y (generous window), then sliced per requested period. No additional network call needed for 1y, 6m, 3m, or YTD.

### 7.8 Per-query context rebuild in advisor

**File:** `advisor_service.py`

Every `/advisor/ask` call rebuilds the full context payload from scratch:
1. Fetch all holdings
2. Fetch fundamentals for each holding (via yfinance — potentially slow)
3. Compute risk snapshot
4. Optionally fetch optimization results
5. Build 2,000–5,000 token context string
6. Send to LLM

Steps 1–4 are identical across every query in the same session. There is no context caching — the context is rebuilt every time even if holdings haven't changed.

---

## 8. Fragile / Regression-Prone Areas

### 8.1 Silent ticker exclusion in quant analytics

**File:** `quant_service.py`

If yfinance fails to return data for a ticker (network error, delisted stock, bad ticker format), that ticker is silently excluded from:
- Volatility calculations
- Correlation matrix
- Beta computation
- Marginal risk contributions

The user sees analytics for a subset of their portfolio with no warning. If 3 out of 20 holdings are dropped, the correlation matrix is 17×17 but the UI shows it as if all 20 are represented. This is a **trust problem** — the numbers are technically correct for the subset, but the user doesn't know they're looking at a subset.

The backend logs `invalid_tickers` but does not include them in the API response.

### 8.2 In-memory cache loss on process restart

**File:** `file_provider.py`

The active uploaded portfolio is stored in `_uploaded_holdings` — a module-level Python list. When the backend process restarts, this list is empty until `_restore_uploaded_portfolio()` runs in `init_db.py`. If the restore fails (DB migration needed, corrupt row, etc.), the frontend gets empty holdings with no error — just `[]`.

The current DB restore logic exists but has never been explicitly tested for failure cases. A failed restore is silent — the list stays empty, every portfolio endpoint returns zero holdings, and the user sees a blank dashboard.

### 8.3 Data mode transition causes blank states

**File:** `usePortfolio.ts`, `dataModeStore.ts`

When the user switches data mode (e.g., uploaded → live), `useDataModeStore` updates, all hooks that subscribe to it re-fetch, and there is a loading window where holdings = `[]`. The dashboard briefly goes blank. There is no "show previous data while fetching new data" pattern. This creates an unstable UI feel during mode switches.

### 8.4 History build failure is silent to the user

**File:** `history_service.py`, `upload.py`

After upload, `build_and_store_portfolio_history()` runs as a background task. It fetches 1-year daily prices from yfinance for every holding. If this fails (timeout, rate limit, bad ticker), the task logs a warning and exits. The user never knows. The Changes page will then show an empty chart with no explanation for why.

The `set_history_build_status(portfolio_id, "pending")` call marks it pending immediately, but there is no "failed" status surfaced to the UI.

### 8.5 Optimization cache invalidation is destructive

**File:** `optimization_service.py`

When the user changes the `er_method` or `cov_method` parameter on the Optimize page, the backend deletes the entire optimization cache and recomputes from scratch. This is correct for correctness but means:
- Changing any single parameter re-does the full scipy computation (~5-15s)
- There is no partial reuse — even changing only the ER method recomputes the covariance matrix (which hasn't changed)

### 8.6 ISIN/ticker format issues silently degrade enrichment

**File:** `sector_enrichment.py`

Prior to Phase 2, tickers uploaded as ISINs, broker-prefixed (`NSE:TCS`), or with exchange noise would pass through as-is and fail enrichment silently — appearing as "Unknown sector" with no actionable reason. Phase 2 addressed the normalizer and column detector, but the static map and yfinance lookup still don't handle ISIN-format inputs at all. A user who re-uploads an old CSV after Phase 2 will see rejected rows for ISINs, but one uploaded before Phase 2 that's still in the DB has `sector = "Unknown"` with no indication of why.

### 8.7 Tightly coupled: Changes page ↔ PortfolioHistory ↔ yfinance

**Files:** `changes/page.tsx`, `history_service.py`

The Changes page daily value chart depends entirely on `PortfolioHistory` rows in the DB. Those rows are built once at upload time via a background yfinance fetch. If yfinance is unavailable at upload time, the chart is permanently empty for that portfolio. There is no "try again" button, no refresh trigger, and no fallback approximation. The chart silently shows nothing.

---

## 9. Backend vs Frontend Responsibility Analysis

This is the clearest architectural problem in the codebase. The line between "backend computes, frontend displays" is frequently crossed in the wrong direction.

### Where computation currently lives vs where it should

| Computation | Currently lives | Should live | Issue |
|------------|----------------|-------------|-------|
| `computeWeightedMetrics()` — weighted PE/PB/ROE | Frontend hook | Backend `/analytics/ratios` | Financial math in a React hook |
| `computeRiskSnapshot()` — HHI, concentration | Frontend (2 pages) | Backend `/portfolio/summary` or `/analytics/risk` | Same calc in two files |
| `market_value = qty * current_price` | Frontend (multiple pages) | Backend (return pre-computed in holdings) | Trivial but repeated client-side |
| `pnl = market_value - (qty * avg_cost)` | Frontend | Backend | Same as above |
| `weight = market_value / total_value` | Frontend | Backend | Requires total_value from another call |
| `mergeWithFundamentals()` | Frontend hook | Backend (include in holdings response) | Join logic in a React hook |
| Client-side ticker filtering for news | Frontend | Frontend | ✓ Correct — instant UX response |
| Quant metrics (Sharpe, beta, vol) | Backend | Backend | ✓ Correct |
| Optimization (efficient frontier) | Backend | Backend | ✓ Correct |
| Enrichment (sector, name resolution) | Backend (upload) | Backend | ✓ Correct |
| Column detection confidence | Backend | Backend | ✓ Correct |
| Snapshot delta computation | Backend | Backend | ✓ Correct |

### The core problem

The backend returns raw holdings with `current_price` but not `market_value`. It returns per-ticker ratios but not weighted portfolio ratios. It returns sector weights but not sector-by-purchase-vs-current comparison.

This forces the frontend to:
1. Fetch holdings (call 1)
2. Fetch summary to get `total_value` (call 2)
3. Compute `weight = market_value / total_value` for each holding
4. Fetch fundamentals (call 3)
5. Compute `weighted_PE = Σ(weight * PE)` for portfolio
6. Re-run `computeRiskSnapshot()` with the now-computed weights

All of this should be done once, in the backend, and returned as a complete portfolio intelligence payload.

### The correct separation

```
Backend responsibility:
  - All numerical computation (risk, weights, ratios, analytics)
  - All data enrichment (sector, name, fundamentals)
  - All persistence (DB reads/writes)
  - All external API calls (yfinance, FMP, NewsAPI)
  - Caching of expensive computations

Frontend responsibility:
  - Rendering pre-computed data
  - UI state (filters, selections, tabs)
  - Client-side filtering/sorting of already-loaded data (fast, instant)
  - Form handling (upload wizard, query input)
  - Navigation and routing
```

---

## 10. Recommended Architecture Direction

### Direction: Backend-prepared intelligence, frontend consumes and displays

The goal should be that every page load results in **one API call that returns everything the page needs**, pre-computed. The frontend should do zero financial math.

### Specific structural changes

**1. Bundle portfolio endpoints**

Replace the three-call `usePortfolio()` pattern with a single `/portfolio/full` endpoint:

```python
GET /portfolio/full?mode=uploaded
→ {
    "holdings": [
      {
        "ticker": "TCS",
        "name": "Tata Consultancy Services",
        "quantity": 10,
        "average_cost": 3500,
        "current_price": 3800,
        "market_value": 38000,      ← pre-computed
        "pnl": 3000,                ← pre-computed
        "pnl_pct": 8.57,            ← pre-computed
        "weight": 0.12,             ← pre-computed
        "sector": "Information Technology",
        "enrichment_status": "enriched"
      }
    ],
    "summary": { "total_value": ..., "total_pnl": ..., "day_change": ... },
    "sectors": [{ "sector": "IT", "weight": 0.35, "value": 130000 }],
    "insights": [...]               ← optional, non-blocking
  }
```

**2. Move weighted fundamentals to backend**

`GET /analytics/ratios` should return both per-ticker ratios AND pre-weighted portfolio metrics:

```python
→ {
    "holdings": [{ "ticker": "TCS", "pe": 28.5, "pb": 12.1, ... }],
    "weighted": {
      "wtd_pe": 22.4,
      "wtd_pb": 8.7,
      "wtd_roe": 0.24,
      "wtd_ev_ebitda": 18.2
    },
    "meta": { "source": "yfinance", "as_of": "2026-04-15", "incomplete": false }
  }
```

**3. Add explicit metadata to all analytics responses**

Every analytics endpoint that depends on external data should include an `integrity` block:

```python
"meta": {
  "valid_tickers": ["TCS.NS", "INFY.NS"],
  "excluded_tickers": ["BADTICKER"],
  "excluded_reason": { "BADTICKER": "not found on yfinance" },
  "incomplete": true,
  "as_of": "2026-04-15T09:30:00Z"
}
```

**4. Cross-period caching in quant service**

Fetch 2 years of price data once, cache the raw price matrix, and slice to the requested period:

```python
# Cache raw price history (expensive)
price_matrix = _cache_get(f"{mode}_prices_2y")
if not price_matrix:
    price_matrix = fetch_all_prices(holdings, period="2y")
    _cache_set(f"{mode}_prices_2y", price_matrix, ttl=600)

# Slice to requested period (cheap)
sliced = price_matrix.last(period_to_days(period))
return compute_metrics(sliced)
```

**5. Lazy-load supplementary advisor context**

Build the advisor context in layers:
- Core (always): holdings + summary + sectors
- Optional (query-triggered): fundamentals, watchlist, snapshots, optimization

```python
POST /advisor/ask
  body: {
    "query": "...",
    "include_fundamentals": true,   ← explicit, not auto-detected
    "include_optimization": false,
    "include_snapshots": false,
    "conversation": [...]
  }
```

**6. Merge news endpoints**

```python
GET /news/full?mode=...&tickers=...&event_type=...
→ { "articles": [...], "events": [...], "meta": {...} }
```

**7. Surface history build status**

```python
GET /portfolio/history/status?portfolio_id=1
→ { "status": "ready" | "building" | "failed" | "empty", "error": null | "..." }
```

The Changes page should poll this on load and show a "history building..." banner rather than silently showing an empty chart.

---

## 11. Prioritized Cleanup / Refactor Backlog

*(Full detail in `refactor-backlog.md`)*

Ranked by: **Impact × Urgency ÷ Implementation Risk**

| Rank | Item | Impact | Urgency | Risk | Notes |
|------|------|--------|---------|------|-------|
| 1 | Bundle `/portfolio/full` endpoint + update `usePortfolio` | High | High | Low | Pure addition; backward-compatible |
| 2 | Move weighted fundamentals computation to backend | High | High | Low | Add to existing `/analytics/ratios` response |
| 3 | Add `meta.excluded_tickers` + `meta.incomplete` to quant/analytics responses | High | High | Low | Transparency fix; no logic change |
| 4 | Cross-period price caching in `quant_service.py` | High | Medium | Medium | Requires refactor of cache key strategy |
| 5 | Surface history build status via polling endpoint | High | Medium | Low | Changes page needs it |
| 6 | Merge `/news/` + `/news/events` → `/news/full` | Medium | Medium | Low | Additive; old endpoints can stay |
| 7 | Lazy-load advisor context (watchlist, snapshots) | Medium | Medium | Low | Frontend-only change to `useAdvisor` |
| 8 | Remove `usePortfolio()` from News page | Medium | Low | Low | Pass tickers from layout context |
| 9 | Add data mode transition buffering | Medium | Low | Medium | Requires Zustand store change |
| 10 | Pre-build advisor context cache per portfolio | Low | Low | High | Complex; defer until advisor is used heavily |
| 11 | Remove `computeRiskSnapshot()` from dashboard; use backend value | Low | Low | Low | Cleanup only; functionality unchanged |
| 12 | Remove duplicate `computeRiskSnapshot()` from risk page | Low | Low | Low | Merge with dashboard refactor |

---

## 12. Suggested Phased Plan for Future Edits

### Phase 3 — Backend intelligence bundling (next)

**Goal:** Backend prepares complete data. Frontend becomes a display layer.

**Scope:**
- Add `GET /portfolio/full` endpoint (holdings + summary + sectors + pre-computed metrics)
- Extend `GET /analytics/ratios` to include `weighted` block
- Add `meta.excluded_tickers` + `meta.incomplete` to quant and analytics responses
- Add `GET /portfolio/history/status` endpoint

**Files to change:** `portfolio.py`, `portfolio_service.py`, `analytics.py`, `quant_service.py`  
**Frontend changes:** Update `usePortfolio` to call `/portfolio/full`; remove `computeRiskSnapshot` from pages; remove weighted metric computation from `useFundamentals`  
**Risk:** Low. All additive. Old endpoints can be deprecated gradually.

---

### Phase 4 — Quant caching + history reliability

**Goal:** The Risk page is always fast. The Changes page always has a chart.

**Scope:**
- Cross-period caching: fetch 2y price matrix once, slice for each period
- History build status endpoint + polling on Changes page
- Explicit retry trigger for failed history builds
- Surface excluded tickers warning on Risk page UI

**Files to change:** `quant_service.py`, `history_service.py`, `history.py` (endpoint), `changes/page.tsx`  
**Risk:** Medium. Quant caching refactor is non-trivial but isolated.

---

### Phase 5 — Advisor context and news cleanup

**Goal:** Advisor loads fast. News page is efficient.

**Scope:**
- Lazy-load watchlist and snapshots in advisor
- Explicit `include_*` flags in `/advisor/ask` request body
- Merge `/news/` + `/news/events` → `/news/full`
- Remove `usePortfolio()` from News page

**Files to change:** `advisor.py`, `advisor_service.py`, `useAdvisor.ts`, `news.py`, `useNews.ts`, `news/page.tsx`  
**Risk:** Low for news. Medium for advisor (conversation context must remain stable).

---

### Phase 6 — Data mode transition UX + stability hardening

**Goal:** Mode switch feels smooth. Process restart doesn't cause blank dashboards.

**Scope:**
- Portfolio data buffer: show previous mode's data during transition
- Explicit in-memory cache restore health check on startup
- Error page for "portfolio cache empty" rather than blank dashboard

**Files to change:** `usePortfolio.ts`, `dataModeStore.ts`, `file_provider.py`, `init_db.py`  
**Risk:** Medium. Zustand store changes can cause subtle re-render bugs.

---

### Not in scope (defer or cut)

- Broker integration
- Public deployment / auth
- Screener
- Simulator UI redesign
- Any new analytical features until Phases 3–4 are complete

---

## Appendix: Quick Reference — Files Most Likely to Cause Regressions

When editing any of the files below, test the full downstream chain:

| File | Downstream impact |
|------|------------------|
| `file_provider.py` | All portfolio endpoints in uploaded mode |
| `sector_enrichment.py` | Upload flow, all enriched holding data |
| `quant_service.py` | Risk page, Advisor (optimization context) |
| `portfolio_service.py` | Dashboard, Holdings, Fundamentals, Peers, Advisor |
| `usePortfolio.ts` | 8 pages |
| `dataModeStore.ts` | All hooks that subscribe to mode |
| `init_db.py` | DB migrations affect all models; test with fresh DB and existing DB |
| `snapshot_service.py` | Changes page delta, Advisor snapshot context |
| `history_service.py` | Changes page daily chart — single point of failure |

---

*End of audit. See `feature-dependency-map.md` and `refactor-backlog.md` for supporting detail.*
