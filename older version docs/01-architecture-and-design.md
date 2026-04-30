# P-Insight — Architecture & Design Document

**Version:** April 2026 (post-hardening, post-market-unification)  
**Scope:** Full-stack personal portfolio analytics tool. Single-user, Indian equity focus, CSV-first data ingestion.

---

## 1. Project Overview

P-Insight is a self-hosted, personal-use portfolio analytics platform. It ingests equity holdings from a CSV or Excel file, enriches them via yfinance, and exposes a rich set of analytics across a Next.js frontend. The backend is a FastAPI server backed by a local SQLite database. There is no authentication layer — this is a deliberate design choice for a single-user local tool.

**What it does:**
- Accepts CSV/Excel uploads of equity holdings (ticker, quantity, average cost, sector, name)
- Enriches holdings at upload time via yfinance (sector classification, company name resolution)
- Provides a portfolio dashboard with KPI tiles, sector allocation, and risk concentration metrics
- Computes full quantitative analytics (Sharpe ratio, volatility, drawdown, correlation, beta vs Nifty 50)
- Shows valuation ratios per holding (PE, PB, EV/EBITDA) from yfinance
- Compares individual holdings against industry peers
- Tracks portfolio history through snapshots — manual or auto-triggered
- Shows market context (Nifty 50, Sensex, Bank Nifty live quotes + sector performance)
- Provides a rule-based and optionally AI-powered portfolio advisor
- Maintains a watchlist of non-portfolio tickers

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | TypeScript, server components for routing only |
| Frontend styling | Tailwind CSS | No CSS modules; all utility classes |
| Frontend state | Zustand | 4 stores: dataModeStore, portfolioStore, filterStore, simulationStore |
| Frontend data fetching | Custom React hooks | All fetches go through `apiFetch` in `services/api.ts` |
| Backend framework | FastAPI (Python) | Async-first; `uvicorn` in dev, `gunicorn + UvicornWorker` in prod |
| Backend validation | Pydantic v2 | Request/response schemas in `app/schemas/` |
| ORM | SQLAlchemy 2.x | Sync session (`SessionLocal`); async support not yet implemented |
| Database | SQLite (local) | Single file `p_insight.db` adjacent to `main.py`. Upgradeable to PostgreSQL via `DATABASE_URL` env var |
| Schema migrations | Manual `ALTER TABLE` in `init_db.py` | No Alembic yet — planned for Phase 2 |
| Market data | yfinance | External dependency; rate-limited; no SLA |
| Portfolio optimisation | PyPortfolioOpt | Used only on `/optimize` and `/simulate` (Tier 3, hidden from nav) |
| Package manager (FE) | pnpm | |
| Package manager (BE) | Poetry | `pyproject.toml` + `poetry.lock` |

---

## 3. Repository Structure

```
P-insight/
├── backend/
│   ├── main.py                  ← entry point (imports app.main)
│   ├── pyproject.toml
│   ├── p_insight.db             ← SQLite file (gitignored)
│   ├── .env                     ← local config (gitignored)
│   └── app/
│       ├── main.py              ← FastAPI app factory + CORS + routes + health
│       ├── core/
│       │   ├── config.py        ← pydantic-settings Settings class
│       │   └── dependencies.py  ← FastAPI DI: get_data_provider(), get_db()
│       ├── api/v1/
│       │   ├── router.py        ← aggregates all endpoint routers under /api/v1
│       │   └── endpoints/       ← one file per feature domain
│       ├── models/              ← SQLAlchemy ORM models
│       ├── schemas/             ← Pydantic request/response schemas
│       ├── data_providers/      ← pluggable data source abstraction
│       ├── analytics/           ← pure-function analytics modules
│       ├── services/            ← business logic services
│       ├── repositories/        ← DB access layer
│       ├── ingestion/           ← CSV/Excel parsing + enrichment pipeline
│       ├── lib/                 ← shared utilities (delta computation, etc.)
│       ├── db/
│       │   ├── database.py      ← SQLAlchemy engine + SessionLocal
│       │   └── init_db.py       ← table creation + column migrations + startup restore
│       └── connectors/          ← broker integration scaffolding
└── frontend/
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/                 ← Next.js App Router pages (one folder per route)
        ├── components/          ← UI component tree (layout, charts, modules)
        ├── hooks/               ← all data-fetching React hooks
        ├── store/               ← Zustand stores
        ├── services/
        │   └── api.ts           ← all fetch calls; single source of truth
        └── types/
            └── index.ts         ← shared TypeScript interfaces
```

---

## 4. Backend Architecture

### 4.1 Application Startup

The FastAPI app is created in `app/main.py` and wired together via a `lifespan` context manager. On startup:

1. `init_db()` runs — creates tables, runs additive column migrations, restores the last uploaded portfolio into memory via `_restore_uploaded_portfolio()`.
2. CORS middleware is configured from `settings.cors_origins()`.
3. The API router is mounted at `/api/v1`.
4. `/health`, `/readiness`, and `/` system endpoints are registered directly on the app.

The `settings` object (a `pydantic_settings.BaseSettings` subclass) is a module-level singleton loaded once at import time from `.env`. All environment config flows through it — nothing is hardcoded in endpoint files.

### 4.2 Data Provider Pattern

The backend uses a **pluggable provider abstraction** to decouple analytics logic from data sources. Every provider implements `BaseDataProvider` (`app/data_providers/base.py`), which defines the contract:

```
BaseDataProvider (abstract)
  ├── FileDataProvider     ← in-memory holdings from uploaded CSV; default for mode=uploaded
  ├── LiveDataProvider     ← yfinance real-time; mode=live
  ├── MockDataProvider     ← deterministic fake data; mode=mock (disabled by default)
  └── BrokerProvider       ← Zerodha scaffold; mode=broker (not implemented)
```

The active provider is resolved per-request by `core/dependencies.py → get_data_provider(mode: str)`, which reads the `mode` query parameter (defaulting to `settings.DEFAULT_DATA_MODE`). If an unsupported mode string is passed, the dependency raises HTTP 400 — this is the enforcement point, not the config layer.

**FileDataProvider specifics:** Holdings are stored in module-level memory (`_uploaded_holdings: list[HoldingBase]`). On upload, the endpoint writes holdings to SQLite then loads them into memory. On backend restart, `_restore_uploaded_portfolio()` in `init_db.py` reloads them from the DB so the user doesn't need to re-upload after a server restart.

### 4.3 API Router Structure

All routes are registered under `/api/v1` via `app/api/v1/router.py`. Each endpoint file owns a single feature domain:

| Router file | Path prefix | Feature |
|---|---|---|
| `market.py` | `/api/v1/market/` | Market landing data — indices, sector perf, gainers/losers |
| `portfolio.py` | `/api/v1/portfolio/` | Holdings, summary, sector allocation |
| `analytics.py` | `/api/v1/analytics/` | Risk metrics, financial ratios, commentary |
| `upload.py` | `/api/v1/upload/` | CSV/Excel parse preview + confirm + refresh |
| `portfolios_mgmt.py` | `/api/v1/portfolios/` | Portfolio CRUD + active portfolio management |
| `snapshots.py` | `/api/v1/snapshots/` | Snapshot create/list/detail + delta computation |
| `quant.py` | `/api/v1/quant/` | Full quantitative analytics (price history based) |
| `optimization.py` | `/api/v1/optimization/` | Mean-variance portfolio optimisation (Tier 3) |
| `advisor.py` | `/api/v1/advisor/` | Rule-based + AI portfolio advisor |
| `peers.py` | `/api/v1/peers/` | Peer comparison per holding |
| `news.py` | `/api/v1/news/` | News and corporate events |
| `watchlist.py` | `/api/v1/watchlist/` | Watchlist CRUD |
| `live.py` | `/api/v1/live/` | Live quotes (deprecated endpoint for indices) |
| `history.py` | `/api/v1/history/` | Portfolio daily history + holdings status |
| `frontier.py` | `/api/v1/frontier/` | Efficient frontier chart data (Tier 3) |
| `ai_chat.py` | `/api/v1/ai-chat/` | Standalone AI chat scaffold (Tier 3) |
| `brokers.py` | `/api/v1/brokers/` | Broker connection scaffold (not implemented) |

System endpoints registered directly on the `app` object (not under `/api/v1`): `/health`, `/readiness`, `/`.

### 4.4 Key Endpoints in Detail

**`GET /api/v1/market/overview`**  
The most-called endpoint. Returns Nifty 50, Sensex, Bank Nifty quotes plus sector performance table plus top gainers/losers. Uses per-symbol `yf.Ticker(sym).history(period="5d")` with an 8-second `ThreadPoolExecutor` timeout per symbol so one slow/unavailable ticker cannot cascade. Cached in-process for 2 minutes. Returns structured `{unavailable: bool, status: "live"|"last_close"|"unavailable"}` per index so the UI can show appropriate state without crashing.

**`POST /api/v1/upload/preview`**  
Accepts multipart CSV or Excel. The ingestion layer (`app/ingestion/`) parses the file, detects column mappings (ticker, quantity, avg_cost, sector, name), and returns a preview of N rows with detection notes. Does not write to DB. Step 1 of the two-step upload flow.

**`POST /api/v1/upload/confirm`**  
Accepts the parsed holdings with the confirmed column mapping. Writes Portfolio + Holding rows to SQLite. Runs per-ticker yfinance enrichment (sector classification, name resolution) via `sector_enrichment.py` with a 5-second per-ticker timeout using `concurrent.futures`. After confirming, fires `pre_warm_cache(FileDataProvider(), "1y")` as a FastAPI `BackgroundTask` — this pre-computes the quant analytics so the first visit to `/risk` is fast.

**`GET /api/v1/quant/full`**  
The most expensive endpoint. Downloads 1 year of daily OHLCV for all holdings from yfinance, aligns them into a price matrix, and computes volatility, Sharpe, Sortino, max drawdown, beta vs Nifty 50, correlation matrix, and cumulative return series. Results are cached in `_QUANT_CACHE` (10 min for live mode, 24h for mock mode). The first cold call after cache expiry can take 5–20 seconds depending on portfolio size and yfinance latency.

**`GET /api/v1/portfolio/holdings`**  
Returns the holding list from the active provider. For `mode=uploaded`, reads from `FileDataProvider._uploaded_holdings` in memory — essentially instant. For `mode=live`, fetches live quotes per holding from yfinance.

### 4.5 Database Schema

Four ORM models, all SQLAlchemy declarative:

**`portfolios` table**
```
id              INTEGER PK
name            VARCHAR(100)
source          VARCHAR(20)      "uploaded" | "mock" | "manual" | "broker"
is_active       BOOLEAN
description     TEXT
upload_filename VARCHAR(255)
last_synced_at  DATETIME
source_metadata TEXT             JSON blob: {"filename": "...", "row_count": N}
created_at      DATETIME
updated_at      DATETIME
```

**`holdings` table**
```
id                  INTEGER PK
portfolio_id        INTEGER FK → portfolios.id
ticker              VARCHAR(20)
name                VARCHAR(150)
quantity            FLOAT
average_cost        FLOAT
current_price       FLOAT
sector              VARCHAR(100)
asset_class         VARCHAR(50)   default "Equity"
currency            VARCHAR(10)   default "INR"
industry            VARCHAR(150)
purchase_date       VARCHAR(20)
normalized_ticker   VARCHAR(30)   yfinance-resolved variant (e.g. "TCS.NS")
sector_status       VARCHAR(20)   "from_file"|"yfinance"|"fmp"|"static_map"|"unknown"
name_status         VARCHAR(20)   "from_file"|"yfinance"|"fmp"|"static_map"|"ticker_fallback"
enrichment_status   VARCHAR(20)   "enriched"|"partial"|"pending"|"failed"
fundamentals_status VARCHAR(20)   "fetched"|"unavailable"|"pending"
peers_status        VARCHAR(20)   "pending"|"found"|"none"
last_enriched_at    DATETIME
failure_reason      TEXT
```

**`snapshots` table**
```
id                  INTEGER PK
portfolio_id        INTEGER FK → portfolios.id
label               VARCHAR(200)  e.g. "Auto — upload", "Before rebalance"
captured_at         DATETIME
total_value         FLOAT
total_cost          FLOAT
total_pnl           FLOAT
total_pnl_pct       FLOAT
num_holdings        INTEGER
top_sector          VARCHAR(100)
sector_weights_json TEXT          JSON: {"IT": 35.2, "Banking": 20.1, ...}
risk_metrics_json   TEXT          JSON: {"hhi": 0.12, "diversification_score": 72, ...}
top_holdings_json   TEXT          JSON: [{"ticker": "TCS", "weight": 18.2}, ...]
```

**`snapshot_holdings` table**
```
id           INTEGER PK
snapshot_id  INTEGER FK → snapshots.id
ticker       VARCHAR(20)
name         VARCHAR(150)
quantity     FLOAT
average_cost FLOAT
market_value FLOAT
weight_pct   FLOAT
sector       VARCHAR(100)
```

**`watchlist` table**
```
id           INTEGER PK
ticker       VARCHAR(20) UNIQUE
name         VARCHAR(150)
tag          VARCHAR(50)   e.g. "High Conviction", "Research"
sector       VARCHAR(100)
target_price FLOAT
notes        TEXT
added_at     DATETIME
```

Schema is auto-created on startup via `Base.metadata.create_all()`. New columns are added via the `_COLUMN_MIGRATIONS` list in `init_db.py` — idempotent `ALTER TABLE … ADD COLUMN` statements wrapped in try/except for the "column already exists" case.

---

## 5. Frontend Architecture

### 5.1 Routing

Next.js App Router. Every folder under `src/app/` is a route. The root page (`src/app/page.tsx`) is a server component that immediately calls `redirect('/market')` — no loading flash, no client-side JavaScript on the root.

| Route | Component | Tier |
|---|---|---|
| `/market` | Market landing page | 1 |
| `/upload` | CSV upload flow | 1 |
| `/dashboard` | Portfolio KPI overview | 1 |
| `/holdings` | Full holdings table | 1 |
| `/fundamentals` | Valuation ratios table | 1 |
| `/risk` | Quantitative risk analytics | 1 |
| `/changes` | Snapshot history + delta | 1 |
| `/peers` | Peer comparison | 2 |
| `/news` | News & events | 2 |
| `/advisor` | Rule-based + AI advisor | 2 |
| `/watchlist` | Watchlist management | 2 |
| `/portfolios` | Portfolio manager | 2 |
| `/sectors` | Sector allocation (nav hidden) | 3 |
| `/optimize` | Portfolio optimiser (nav hidden) | 3 |
| `/simulate` | Scenario simulator (nav hidden) | 3 |
| `/brokers` | Broker sync scaffold (nav hidden) | 3 |
| `/frontier` | Efficient frontier chart (nav hidden) | 3 |
| `/ai-chat` | Standalone AI chat scaffold (nav hidden) | 3 |
| `/debug` | System diagnostics (dev only) | dev |

### 5.2 Data Fetching Layer

All HTTP calls go through `src/services/api.ts`. Components and hooks never call `fetch()` directly.

**`apiFetch<T>(endpoint, options?)`** is the base utility:
- Attaches a 15-second `AbortController` timeout to every request.
- Throws a typed error with the backend's `detail` field on non-2xx responses.
- On `AbortError`, throws a human-readable timeout message.

API namespaces exported from `api.ts`: `portfolioApi`, `analyticsApi`, `frontierApi`, `watchlistApi`, `newsApi`, `advisorApi`, `liveApi`, `quantApi`, `optimizationApi`, `portfoliosMgmtApi`, `snapshotsApi`, `brokersApi`, `historyApi`, `uploadApi`.

### 5.3 Hook Architecture

Every page drives its data through hooks in `src/hooks/`. Hooks encapsulate fetch state (`data`, `loading`, `error`), call `apiFetch`, and handle errors locally. They never share state — pages that need the same data call the same hook independently. (This is a known duplication issue; the fix is a shared Zustand/Context portfolio cache — see backlog doc.)

Key hooks and what they fetch:

| Hook | Fetches | Used by |
|---|---|---|
| `usePortfolio` | `GET /portfolio/`, `/portfolio/summary`, `/portfolio/sectors` (parallel Promise.all) | dashboard, holdings, fundamentals, risk, peers, news, advisor, watchlist |
| `useQuantAnalytics` | `GET /quant/full` | risk page only |
| `useFundamentals(holdings)` | `GET /analytics/ratios` | fundamentals page |
| `usePeerComparison(ticker)` | `GET /peers/{ticker}` | peers page |
| `usePortfolios` | `GET /portfolios/` | portfolios page, topbar PortfolioSwitcher |
| `useSnapshots(portfolioId)` | `GET /portfolios/{id}/snapshots` | changes page |
| `useSnapshotHistory(portfolioId)` | Lazy parallel load of up to 12 `GET /snapshots/{id}` | changes page |
| `useWatchlist` | `GET /watchlist/`, mutations via POST/DELETE | watchlist page |
| `useNews(filters)` | `GET /news/` | news page |
| `useAdvisor` | `GET /advisor/status`, `POST /advisor/ask` (on send) | advisor page |
| `useIndices` | `GET /market/overview` (filters to 3 symbols) | topbar IndexTicker |
| `useOptimization` | `GET /optimization/full` | optimize page, simulate page (Tier 3) |
| `useSimulation` | `GET /optimization/full` | simulate page (Tier 3) |
| `useDataMode` | Zustand dataModeStore (no fetch) | risk page, advisor, others |

### 5.4 State Management (Zustand)

Four Zustand stores:

**`dataModeStore`** — tracks `activeMode: "uploaded" | "live"`. Injected as the `mode` query param into every API call. Switching mode causes all hooks to refetch.

**`portfolioStore`** — tracks `activePortfolioId: number | null`. Used by `usePortfolios` and the `PortfolioSwitcher` topbar component to know which portfolio is active.

**`filterStore`** — holds UI filter state (search string, sector filter, sort column/direction) for the holdings table. Client-side only; no API calls.

**`simulationStore`** — holds scenario parameters for the `/simulate` page. Not persisted.

### 5.5 Layout & AppShell

Every page is wrapped in `src/app/layout.tsx`, which renders the AppShell. The AppShell contains:
- **Sidebar** — navigation links grouped into Core, Explore, Manage. Tier 3 routes are removed from the nav; the dev Diagnostics item is gated behind `NODE_ENV === 'development'`.
- **Topbar** — contains `IndexTicker` (3 index chips polling `/market/overview` every 120s) and `PortfolioSwitcher` (calls `usePortfolios` — lightweight DB query).
- **Main content slot** — the page component rendered by Next.js.

**Important:** The AppShell mounts no data hooks of its own. The only data call from the shell layer is `usePortfolios` inside `PortfolioSwitcher`, which is a fast SQLite read.

---

## 6. Feature Flows

### 6.1 Upload Flow

```
User selects file
  → POST /api/v1/upload/preview (multipart)
      ← ingestion layer parses CSV/Excel
      ← detects columns (ticker, quantity, avg_cost, sector, name)
      ← returns preview table + column mapping + detection notes
  → User inspects preview, clicks Confirm
  → POST /api/v1/upload/confirm (JSON: holdings + mapping)
      ← writes Portfolio row to SQLite (source="uploaded")
      ← writes Holding rows to SQLite
      ← loads holdings into FileDataProvider._uploaded_holdings (in-memory)
      ← triggers BackgroundTask: pre_warm_cache("1y")
          → downloads 1y price history for all tickers in background
          → stores in _QUANT_CACHE["uploaded_1y"]
          → logs "Quant cache pre-warmed" ~30-60s later
      ← returns {portfolio_id, holdings_count, enrichment_summary}
  → Frontend sets activePortfolioId, redirects to /dashboard
```

**Failure resilience:** Per-ticker enrichment failures (yfinance timeout) do not block the upload. The holding gets `sector_status="unknown"`, `enrichment_status="partial"`, and is included in the portfolio with "Other" sector. The upload always succeeds unless the file itself is unparseable.

### 6.2 Dashboard Load Flow

```
User navigates to /dashboard
  → usePortfolio fires 3 parallel calls:
      GET /api/v1/portfolio/     (mode=uploaded)  ← holdings from FileDataProvider
      GET /api/v1/portfolio/summary               ← total value, P&L, cost basis
      GET /api/v1/portfolio/sectors               ← sector allocation array
  → On success: all 3 results merged, dashboard renders
  → Separately (non-blocking, fire-and-forget):
      GET /api/v1/analytics/commentary            ← AI/rule insights
      On failure: console.warn only; page unaffected

  Risk tiles on dashboard are computed CLIENT-SIDE from holdings[]:
    - HHI (Herfindahl-Hirschman Index) for concentration
    - Top 3 holdings weight
    - Max single position weight
    No /quant/full call on dashboard. Zero extra API calls.
```

### 6.3 Risk Page Load Flow

```
User navigates to /risk
  → usePortfolio fires (same 3 parallel calls as dashboard)
  → useQuantAnalytics fires immediately on mount:
      GET /api/v1/quant/full?period=1y&mode=uploaded
        → Backend checks _QUANT_CACHE["uploaded_1y"]
        → Cache HIT (if pre-warm completed): returns instantly
        → Cache MISS (first load / cache expired): downloads price history
            for all holdings from yfinance, aligns matrix, computes:
              - Annualised volatility per holding
              - Portfolio volatility
              - Sharpe ratio (risk-free rate = 6.5%)
              - Sortino ratio
              - Maximum drawdown
              - Beta vs Nifty 50
              - Alpha
              - Information ratio
              - Cumulative return time series (portfolio + benchmark)
              - Drawdown time series
              - Correlation matrix (N×N)
            Stores result in _QUANT_CACHE["uploaded_1y"] with 10-min TTL
  → RiskSnapshotCard always renders from riskSnapshot (client-side HHI data)
  → Full quant charts render only after useQuantAnalytics resolves
```

### 6.4 Snapshot & Changes Flow

```
Taking a snapshot (manual):
  POST /api/v1/portfolios/{id}/snapshots
    ← computes summary metrics from current holdings
    ← writes Snapshot + SnapshotHolding rows to SQLite
    ← returns snapshot summary

Viewing /changes:
  → usePortfolios fires: GET /portfolios/ (list)
  → useSnapshots(portfolioId): GET /portfolios/{id}/snapshots (summary list)
  → useSnapshotHistory(portfolioId): lazily loads up to 12 snapshots in parallel
      GET /snapshots/{id} for each snapshot in the list
  → Delta computation (app/lib/delta.py): takes two Snapshot objects,
      computes PortfolioDelta (added/removed holdings, weight changes, sector shifts)
      No external API calls — pure SQLite reads + client-side computation

Empty state: if 0 snapshots exist, shows "Take your first snapshot" CTA.
Single snapshot: shows current state only (no delta possible).
```

### 6.5 Advisor Flow

```
User sends a message:
  → POST /api/v1/advisor/ask
      Payload: { query, conversation_history, portfolio_context }
      portfolio_context assembled client-side from:
        - usePortfolio (holdings, summary, sectors)
        - useFundamentals (ratios)
        - useWatchlist (watchlist items)
        - usePortfolios (portfolio list)
        - useSnapshots (recent snapshots)

  → Backend advisor.py:
      If AI_CHAT_ENABLED=true and ANTHROPIC_API_KEY or OPENAI_API_KEY set:
        → Calls LLM with portfolio context as system message
        → Returns AI-generated response
      Else:
        → Runs rule-based engine against portfolio context
        → Returns structured rule-based recommendations

  → On AI failure: falls back to rule-based automatically (no error shown)
```

---

## 7. Cross-Cutting Concerns

### 7.1 Timeout Strategy

Every external call has a timeout guard at the appropriate layer:

| Call site | Mechanism | Timeout |
|---|---|---|
| Frontend API calls | `AbortController` in `apiFetch` | 15 seconds |
| Market page calls | Local `fetchWithTimeout` (not apiFetch) | 15 seconds |
| Backend: per-index market fetch | `ThreadPoolExecutor future.result(timeout=8)` | 8 seconds per index |
| Backend: upload enrichment per ticker | `concurrent.futures future.result(timeout=5)` | 5 seconds per ticker |
| Backend: quant price history (yfinance) | `asyncio.to_thread` + application-level timeout | No hard timeout per ticker yet (known gap) |

### 7.2 Caching Strategy

| Cache | Location | TTL | Key |
|---|---|---|---|
| Market overview | In-process dict in `market.py` | 2 minutes | N/A (single value) |
| Quant analytics | `_QUANT_CACHE` in `quant_service.py` | 10 min (live), 24h (mock) | `"{mode}_{period}"` |
| No frontend caching | — | — | Hooks re-fetch on every mount |

### 7.3 Error Handling Philosophy

- **Tier 1 pages:** Core 3 portfolio calls (`holdings`, `summary`, `sectors`) must succeed. Failure shows a full-page error banner with a retry button.
- **Non-critical calls:** Commentary, quant cache pre-warm, advisor fallback — failures are swallowed (`console.warn`); page renders without that data.
- **Per-section failures:** Market page uses WifiOff cards per section. Risk page shows `RiskSnapshotCard` even if `/quant/full` fails. Fundamentals page header renders even if ratios fail.
- **Never a blank screen:** Every page has an explicit loading state, error state, and (where applicable) empty state. Undefined/null data never reaches the render layer unchecked.

### 7.4 Data Mode System

The `mode` query parameter controls which data provider the backend uses:

- `mode=uploaded` — reads from `FileDataProvider._uploaded_holdings` (in-memory). Fast. Default.
- `mode=live` — reads live prices from `LiveDataProvider` (yfinance). Slower.
- `mode=broker` — scaffold only; not implemented.
- `mode=mock` — disabled; `MockDataProvider` exists in code but `DEFAULT_DATA_MODE=uploaded` in `.env`.

The mode is set globally via `dataModeStore` in Zustand and injected into every API call via the `withMode(endpoint, mode)` helper in `api.ts`. The mode switcher in the UI lets the user toggle between `uploaded` and `live`.

### 7.5 Feature Flags

Controlled via `.env` and read through `settings`:

| Flag | Default | Effect |
|---|---|---|
| `LIVE_API_ENABLED` | `true` | Enables the `live` data mode option |
| `BROKER_SYNC_ENABLED` | `false` | Broker sync endpoints (stub) |
| `AI_CHAT_ENABLED` | `false` | AI path in advisor. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` too |
| `ADVANCED_ANALYTICS_ENABLED` | `false` | Reserved — not currently wired to any specific feature |
| `DOCS_ENABLED` | `false` | Swagger UI + ReDoc at `/docs` and `/redoc` |
| `NEWS_API_KEY` | empty | News endpoint active only when set |

---

## 8. API Surface Reference

### System
```
GET  /health          → liveness probe + feature flags
GET  /readiness       → readiness probe (checks DB)
GET  /                → welcome message
```

### Market
```
GET  /api/v1/market/overview   → indices + sector perf + gainers/losers
```

### Portfolio
```
GET  /api/v1/portfolio/           → holdings list
GET  /api/v1/portfolio/summary    → total value, cost, P&L
GET  /api/v1/portfolio/sectors    → sector allocation array
```

### Upload
```
POST /api/v1/upload/preview       → parse file, return column map + preview
POST /api/v1/upload/confirm       → persist + enrich + pre-warm cache
POST /api/v1/upload/refresh       → re-upload to existing portfolio
```

### Analytics
```
GET  /api/v1/analytics/risk        → risk metrics (HHI, concentration, etc.)
GET  /api/v1/analytics/ratios      → PE, PB, EV/EBITDA per holding
GET  /api/v1/analytics/commentary  → AI/rule-based portfolio insights
```

### Quant & Optimisation (Tier 2/3)
```
GET  /api/v1/quant/full            → full quant analytics (price-history-based)
GET  /api/v1/optimization/full     → mean-variance portfolio optimisation
GET  /api/v1/frontier/             → efficient frontier curve data
```

### Portfolio Management
```
GET    /api/v1/portfolios/          → list all portfolios
POST   /api/v1/portfolios/          → create portfolio
DELETE /api/v1/portfolios/{id}      → delete portfolio
GET    /api/v1/portfolios/{id}/snapshots  → snapshot list for a portfolio
POST   /api/v1/portfolios/{id}/snapshots  → take a snapshot
```

### Snapshots
```
GET  /api/v1/snapshots/{id}         → full snapshot detail + holdings
GET  /api/v1/snapshots/{id}/delta   → delta vs another snapshot
```

### Peers
```
GET  /api/v1/peers/{ticker}         → peer fundamentals for a ticker
```

### News & Events
```
GET  /api/v1/news/                  → news articles + corporate events
```

### Watchlist
```
GET    /api/v1/watchlist/           → watchlist items
POST   /api/v1/watchlist/           → add item
DELETE /api/v1/watchlist/{id}       → remove item
```

### Advisor
```
GET  /api/v1/advisor/status         → advisor config + LLM availability
POST /api/v1/advisor/ask            → send message, get response
```

### History
```
GET  /api/v1/history/portfolio      → portfolio daily value history
GET  /api/v1/history/holdings/status → per-holding enrichment status
```

### Live (Deprecated)
```
GET  /api/v1/live/indices           → DEPRECATED. Use /market/overview instead.
```

---

## 9. Configuration Reference

All config lives in `backend/.env`. The `Settings` class in `app/core/config.py` reads it via pydantic-settings.

```bash
# Application
APP_ENV=development          # development | staging | production
DEBUG=false
LOG_LEVEL=INFO
DOCS_ENABLED=true            # Set true to enable /docs and /redoc

# CORS
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=             # Comma-separated; takes precedence over FRONTEND_URL

# Database
DATABASE_URL=sqlite:///./p_insight.db

# Data mode
DEFAULT_DATA_MODE=uploaded   # uploaded | live (do NOT set to mock)

# Feature flags
LIVE_API_ENABLED=true
BROKER_SYNC_ENABLED=false
AI_CHAT_ENABLED=false

# API keys (all optional)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
NEWS_API_KEY=
ALPHA_VANTAGE_API_KEY=
FINANCIAL_MODELING_PREP_API_KEY=
ZERODHA_API_KEY=
ZERODHA_API_SECRET=
```

---

## 10. Local Development Startup

```bash
# Backend (from backend/)
poetry install
uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/)
pnpm install
pnpm dev
```

Frontend defaults to `http://localhost:3000`. Backend at `http://localhost:8000`. The `NEXT_PUBLIC_API_URL` env var controls the backend URL from the frontend (`next.config.ts`).

**First run checklist:**
1. Backend starts → look for `✅ Database initialised` in stdout
2. `GET http://localhost:8000/health` returns `"status": "healthy"`
3. `GET http://localhost:8000/api/v1/market/overview` returns index data (or clean unavailable state)
4. Navigate to `http://localhost:3000` → should redirect to `/market`
5. Upload a CSV portfolio → confirm → redirect to `/dashboard`
6. Verify `/risk` page renders (quant pre-warm should have fired in background)
