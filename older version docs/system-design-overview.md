# P-Insight — System Design Overview

**Status:** Current-state description, April 2026.
**Purpose:** A single-page technical overview of how P-Insight actually works today. Read this before making architectural changes. Pair with [module-contract-blueprint.md](./module-contract-blueprint.md) for deeper per-module contracts.

---

## 1. What P-Insight is (one paragraph)

P-Insight is a **self-hosted, single-user** portfolio analytics web app for Indian equities. Users upload a CSV/Excel of their holdings; the backend parses, enriches (via `yfinance` and optional FMP), persists to SQLite, and exposes a rich analytics surface — fundamentals, risk metrics, quant analytics, peer comparison, efficient frontier, an LLM-powered advisor, a watchlist, news, and market context. There is **no auth**, **no multi-tenancy**, **no cloud-only assumption**. It is explicitly designed to run on one person's machine (or a single Render/Railway instance) and answer "what is my portfolio doing, and what should I do next?".

---

## 2. High-level architecture

```
┌───────────────────────────────────────────────────────────────┐
│                       Next.js 14 (App Router)                 │
│                                                               │
│  src/app/           pages                                     │
│  src/components/    UI                                        │
│  src/hooks/         21 data-fetching hooks                    │
│  src/store/         4 Zustand stores                          │
│  src/lib/           frontend compute (risk, advisor, sim …)   │
│  src/services/api.ts  single HTTP client                      │
└─────────────────────────────┬─────────────────────────────────┘
                              │ HTTP (JSON) + ?mode=…
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                     FastAPI (Python 3.11+)                    │
│                                                               │
│  app/api/v1/router.py    — registers 17 endpoint routers      │
│  app/api/v1/endpoints/   — one file per domain                │
│  app/services/           — business logic                     │
│  app/analytics/          — pure math (returns, risk, etc.)    │
│  app/optimization/       — PyPortfolioOpt wrappers            │
│  app/data_providers/     — provider pattern (4 providers)     │
│  app/ingestion/          — CSV parsing + enrichment           │
│  app/repositories/       — SQLAlchemy access                  │
│  app/models/             — ORM tables                         │
│  app/schemas/            — Pydantic DTOs                      │
│  app/core/               — config + DI                        │
│  app/db/                 — engine, session, init, migrations  │
│  app/connectors/         — broker scaffold (unfinished)       │
└─────────────┬──────────────────────────┬──────────────────────┘
              │                          │
      ┌───────▼─────┐            ┌───────▼─────────────┐
      │  SQLite     │            │ External services   │
      │  p_insight  │            │  • yfinance         │
      │  .db        │            │  • FMP (optional)   │
      │             │            │  • NewsAPI (opt.)   │
      │  portfolios │            │  • Anthropic (opt.) │
      │  holdings   │            │  • OpenAI (opt.)    │
      │  snapshots  │            │  • Zerodha (stub)   │
      │  watchlist  │            │  • IBKR (stub)      │
      │  brokers    │            └─────────────────────┘
      └─────────────┘
```

---

## 3. Frontend architecture

### 3.1 Framework
- **Next.js 14** (App Router). Server components used for routing shell only — all data fetching is client-side via hooks. No server actions, no server-component data loading.
- **TypeScript** throughout. Types in `src/types/index.ts` mirror backend Pydantic schemas loosely (no codegen, maintained manually).
- **Tailwind CSS** (no CSS modules). Utility-first.

### 3.2 State (Zustand)
Four small stores:
- `dataModeStore.ts` — active data mode (`uploaded` | `live` | `broker`), persisted to localStorage. Read by every hook before fetching. **This is the only cross-cutting state.**
- `portfolioStore.ts` — `activePortfolioId` + lightweight `portfolios[]`. Not persisted. Mutated from `/portfolios` page and the sidebar switcher.
- `simulationStore.ts` — session-scoped `simHoldings[]` for the simulator (survives navigation within a session). Only `useSimulation` writes to it.
- `filterStore.ts` — cross-dashboard sector filter state.

### 3.3 Data-fetching pattern
- **No SWR / React Query.** Every hook is vanilla `useState + useEffect + useCallback`.
- Single HTTP client in `src/services/api.ts` — a thin `apiFetch(url, options)` with a 15s AbortController timeout.
- `withMode(url, mode)` helper appends `?mode=...` to every data-fetching URL. This is how the data mode flows from the store to the backend.
- **Bundled endpoints** are the preferred pattern: `/portfolio/full`, `/analytics/ratios`, `/quant/full`, `/optimization/full`. One call, one response, pre-aggregated.
- **No request deduplication.** Navigating dashboard → holdings → risk refetches `/portfolio/full` three times. Known, deferred (see [refactor-rebuild-blueprint.md](./refactor-rebuild-blueprint.md)).

### 3.4 Compute libs (in `src/lib/`)
Pure functions, no React, no API calls:
- `risk.ts` — **`computeRiskSnapshot()`** computes HHI, effective N, diversification score, risk profile classification.
- `fundamentals.ts` — `mergeWithFundamentals()`, `computeWeightedMetrics()` (still used by simulation), threshold colour mappings.
- `simulation.ts` — scenario builder, weight normalisation, rebalance suggestions, scenario delta.
- `advisor.ts` — 7 rule-based analyzers + query router. Fallback when no LLM key configured.
- `delta.ts` — portfolio delta between two snapshots.
- `insights.ts` — generates Action Center items from portfolio state.
- `utils.ts` — `cn()` for Tailwind class merging.

> **Blunt note:** `risk.ts`, `advisor.ts`, `insights.ts`, and the threshold logic in `fundamentals.ts` are **intelligence that should live server-side.** They are the single biggest architectural drift from "backend = brains, frontend = eyes" and show up across 5+ pages.

### 3.5 Key frontend flows

**Upload flow**
```
/upload page → POST /upload/parse → preview + column mapping UI
             → POST /upload/confirm → portfolio_id + enrichment kicked off
             → poll GET /upload/status until enrichment done
             → navigate to /dashboard
```

**Dashboard render**
```
/dashboard page
  → usePortfolio() → GET /portfolio/full?mode=...
  → computeRiskSnapshot(holdings, sectors, summary)   (frontend)
  → generateInsights(holdings, sectors, summary, …)   (frontend)
  → render: PortfolioSummaryCards, SectorAllocationChart, RiskSnapshotCard, ActionCenter, AdvisorPanel
```

**Risk page render**
```
/risk page
  → usePortfolio()            → cached from previous page usually
  → useQuantAnalytics()       → GET /quant/full?mode=...&period=1y     (5–20s cold)
  → computeRiskSnapshot(...)  (frontend, pure)
  → render: profile card + concentration breakdown + full quant panel
```

**Advisor query**
```
/advisor page
  → useAdvisor() assembles engineInput (usePortfolio + useFundamentals + useWatchlist + useSnapshots)
  → on mount: GET /advisor/status                    → determines provider + availability
  → on send: POST /advisor/ask with engineInput       if AI available
             else routeQuery(engineInput) locally     (frontend fallback)
  → render: structured AdvisorResponse cards
```

---

## 4. Backend architecture

### 4.1 Framework
- **FastAPI** with Python 3.11+.
- **Uvicorn** for local dev, **gunicorn + UvicornWorker** for production (per `DEPLOYMENT.md`).
- **Pydantic v2** for validation and response schemas (`app/schemas/`).
- **SQLAlchemy 2.x** sync sessions (async not implemented).
- **PyPortfolioOpt** for efficient frontier and optimisation.

### 4.2 Application startup (`app/main.py` + lifespan)
1. `init_db()` — creates tables, runs additive `ALTER TABLE` migrations, runs `_restore_uploaded_portfolio()` so the most recent uploaded portfolio is present in `FileDataProvider._uploaded_holdings`.
2. CORS middleware configured from `settings.cors_origins()`.
3. `api_router` mounted at `/api/v1`.
4. `/health`, `/readiness`, `/` registered directly.

### 4.3 Dependency injection
`app/core/dependencies.py`:
- `DbSession = Annotated[Session, Depends(get_db)]` — request-scoped DB session.
- `get_data_provider(mode: str, db: Session)` — resolves the active `BaseDataProvider`. Returns 400 if `mode` is unsupported ("mock" is now rejected), 503 if provider is unavailable.

### 4.4 Route map (one line per router)

Prefix: `/api/v1`. Each is `include_router`'d from `app/api/v1/router.py`.

| Prefix | File | What it serves |
|---|---|---|
| `/market` | endpoints/market.py | NIFTY 50 / Sensex / Bank Nifty + 8 sector indices + top 5 gainers/losers |
| `/portfolio` | endpoints/portfolio.py | `/full` (bundle), `/summary`, `/sectors`, `POST /upload` (legacy) |
| `/analytics` | endpoints/analytics.py | `/ratios` (fundamentals per holding + weighted), `/risk` (scaffold) |
| `/watchlist` | endpoints/watchlist.py | CRUD |
| `/peers` | endpoints/peers.py | `/{ticker}` comparison |
| `/news` | endpoints/news.py | `/` articles, `/events` (scaffold) |
| `/frontier` | endpoints/frontier.py | **deprecated**, redirects to `/optimization/full` |
| `/ai_chat` | endpoints/ai_chat.py | **scaffold/deprecated**; `/advisor` superseded it |
| `/advisor` | endpoints/advisor.py | `POST /ask`, `GET /status` |
| `/live` | endpoints/live.py | live provider pass-through (most superseded by `/market`) |
| `/quant` | endpoints/quant.py | `/full`, `/status` |
| `/optimization` | endpoints/optimization.py | `/full`, `/status` |
| `/upload` | endpoints/upload.py | V2 two-step: `POST /parse`, `POST /confirm`, `GET /status` |
| `/portfolios` | endpoints/portfolios_mgmt.py | list / set active / delete |
| `/snapshots` | endpoints/snapshots.py | list, detail, create, delta |
| `/brokers` | endpoints/brokers.py | **scaffold** (Zerodha not implemented) |
| `/history` | endpoints/history.py | daily portfolio value (scaffold) |

### 4.5 Provider pattern (`app/data_providers/`)

Abstract base: `BaseDataProvider` (in `base.py`) defines:
- `mode_name: str`
- `is_available: bool`
- `get_holdings() → list[HoldingBase]`
- `get_price_history(ticker, period, interval) → dict`
- `get_fundamentals(ticker) → dict`
- `get_news(tickers, event_type?) → list[dict]`
- `get_events(tickers, event_type?) → list[dict]` (default `[]`)
- `get_peers(ticker) → list[str]`
- `get_benchmark_history(benchmark, period) → dict` (default empty)

Concrete providers:
- `FileDataProvider` — serves `mode=uploaded`. Reads holdings from module-level `_uploaded_holdings`. Proxies fundamentals/prices to yfinance (via shared `live_provider` helpers).
- `LiveAPIProvider` — serves `mode=live`. Full yfinance integration. Reads "active" portfolio from DB. Has in-process `_PRICE_CACHE` (60s) and `_FUND_CACHE` (30 min). Resolves Indian tickers via `.NS → .BO → bare` fallback chain.
- `MockDataProvider` — **disabled.** `get_data_provider()` returns 400 if `mode=mock`.
- `BrokerSyncProvider` — scaffold; not connected to any broker.

### 4.6 Services layer (`app/services/`)
Business logic between routes and providers/repositories:

- `portfolio_service.py` — `PortfolioService.get_full()` assembles enriched holdings + summary + sectors in two passes.
- `upload_v2_service.py` — `classify_rows_v2()`, `persist_base_portfolio()`, `update_memory_cache()`, `run_background_enrichment()`.
- `snapshot_service.py` — snapshot CRUD.
- `history_service.py` — daily portfolio value series (scaffold).
- `portfolio_manager.py` — multi-portfolio management.
- `broker_service.py` — broker CRUD (scaffold).
- `ai_advisor_service.py` + `context_builder.py` + `ai/provider.py` — LLM orchestration (Claude / OpenAI).

### 4.7 Analytics layer (`app/analytics/`)
Pure math, no I/O:
- `returns.py` — price matrix construction, daily/log/cumulative returns, portfolio return series, per-ticker contributions.
- `risk.py` — vol, Sharpe, Sortino, max drawdown, beta, VaR, tracking error, information ratio, Jensen's alpha.
- `benchmark.py` — yfinance benchmark fetch (1h cache) or unavailable.
- `correlation.py` — pairwise correlation matrix.
- `quant_service.py` — **orchestration layer** that wires price fetch + analytics into a cached bundle (`_QUANT_CACHE`).
- `commentary.py` — narrative generators (unconfirmed usage).

### 4.8 Optimisation layer (`app/optimization/`)
- `expected_returns.py` — historical_mean / ema_mean.
- `covariance.py` — sample / ledoit_wolf / auto.
- `objectives.py` — constraint enforcement.
- `frontier.py` — efficient frontier curve builder.
- `optimizer_service.py` — wires all of the above; cached 10 min live / 24h mock.
- `types.py` — Pydantic shapes for constraints + output.

### 4.9 Ingestion (`app/ingestion/`)
- `column_detector.py` — canonical-to-user-column mapping with confidence.
- `normalizer.py` — DataFrame loader, cleaners (ticker uppercasing, numeric coercion, date parsing).
- `sector_enrichment.py` — the ticker → sector/name fallback chain: file → yfinance (5s timeout) → FMP → static map (~150 tickers) → "Unknown". Returns `EnrichmentRecord` per ticker tracking which source won.

### 4.10 Caches (master list)
All caches today are **in-process Python dicts**. None persisted. None shared across workers.

| Cache | Location | TTL | Lost on restart? |
|---|---|---|---|
| `_PRICE_CACHE` | data_providers/live_provider.py | 60s | ✅ |
| `_FUND_CACHE` | data_providers/live_provider.py | 30 min | ✅ |
| `_BENCHMARK_CACHE` | analytics/benchmark.py | 1h | ✅ |
| `_QUANT_CACHE` | analytics/quant_service.py | 10 min live / 24h mock | ✅ |
| `_OPT_CACHE` | optimization/optimizer_service.py | 10 min live / 24h mock | ✅ |
| `_OVERVIEW_CACHE` | endpoints/market.py | 2 min | ✅ |
| Frontend `_itemCache` (watchlist) | hooks/useWatchlist.ts | session | ✅ (page reload) |

The pre-warm-on-upload pattern (`pre_warm_cache()` launched as `BackgroundTasks` after a confirm) is the only mitigation — it fills `_QUANT_CACHE` and `_OPT_CACHE` so the user's first `/risk` or `/optimize` visit is fast. But restart wipes it.

### 4.11 Persistence (SQLite)

Local file: `backend/p_insight.db`. Driver: `sqlite3`. Sync SQLAlchemy 2.x.

Tables (via `app/models/*`):

**portfolios**
- id, name, source (`mock`|`uploaded`|`manual`|`live`|`broker`), is_active (bool), description, upload_filename, last_synced_at, source_metadata (JSON text), created_at, updated_at.

**holdings**
- id, portfolio_id (FK → portfolios), ticker (indexed), name, quantity, average_cost, current_price.
- Enrichment: normalized_ticker, sector, industry, asset_class, currency, notes.
- Status columns: sector_status, name_status, fundamentals_status, enrichment_status, peers_status.
- Failure tracking: failure_reason, enrichment_reason.
- Timestamps: last_enriched_at.

**snapshots**
- Represented in `app/models/snapshot.py` (shape not fully inspected but stores per-portfolio snapshots with holdings-at-the-time).

**history** (scaffold — model exists, endpoint scaffold)
- `app/models/history.py`.

**watchlist**
- id, ticker (unique+indexed), name, tag, sector, target_price, notes, added_at.

**broker_connections** (scaffold)
- `app/models/broker_connection.py`.

Schema migrations: **manual `ALTER TABLE`** inside `init_db.py`'s `_COLUMN_MIGRATIONS` block. No Alembic. This is flagged as a beta-blocker the moment a PostgreSQL production is considered.

### 4.12 Configuration (`app/core/config.py`)

`Settings` (pydantic-settings BaseSettings) loaded from `.env`:
- `APP_NAME`, `APP_VERSION`, `APP_ENV`, `LOG_LEVEL`, `DOCS_ENABLED`.
- `DATABASE_URL` (defaults to sqlite local file).
- `DEFAULT_DATA_MODE`.
- Feature flags: `LIVE_API_ENABLED`, `BROKER_SYNC_ENABLED`, `AI_CHAT_ENABLED`, `ADVANCED_ANALYTICS_ENABLED`.
- Keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEWS_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `FINANCIAL_MODELING_PREP_API_KEY`, `ZERODHA_API_KEY`.
- CORS: `cors_origins()` builds the list from `CORS_ORIGINS` env.

All environment knobs flow through this one module. Nothing is hardcoded in endpoints. This is a clean pattern.

---

## 5. Request lifecycle (example: `/quant/full`)

1. Frontend `/risk` page mounts `useQuantAnalytics()`.
2. Hook reads `mode` from `dataModeStore` and calls `apiFetch('/api/v1/quant/full?mode=live&period=1y')`.
3. Browser hits FastAPI.
4. `get_data_provider(mode="live", db)` resolves to `LiveAPIProvider(db=db)`.
5. Endpoint calls `QuantAnalyticsService(provider).compute_all(period="1y")`.
6. **Cache hit** (`_QUANT_CACHE[(mode,period)]`) → return cached result (< 10 ms).
7. **Cache miss:**
   a. `provider.get_holdings()` → queries DB for active portfolio, batch-fetches prices from yfinance, returns `HoldingBase[]` (each with `data_source`).
   b. `_fetch_all_histories(holdings, period)` → `asyncio.gather` of `provider.get_price_history(ticker, period)` per ticker.
   c. `build_price_matrix(price_hists)` → aligned DataFrame.
   d. `portfolio_return_series(price_df, weights)` → daily portfolio returns.
   e. `get_benchmark(mode, period)` → NIFTY 50 series (1h cached), or empty+`benchmark_available=False`.
   f. `compute_full_risk_metrics(portfolio_returns, benchmark_returns)` → metrics dict.
   g. Compute drawdown, correlation, per-holding contributions.
   h. Populate `_QUANT_CACHE` and return.
8. Response JSON returned; hook sets state; component renders.

Cold path latency: 5–20s. Warm path: <50ms.

---

## 6. Key page flows (minimal)

### Uploaded-mode MVP flow
```
/upload → /dashboard → /holdings → /fundamentals → /risk → /advisor
```

### Data mode toggle
```
Topbar toggle sets dataModeStore.mode
  → useEffect in every subscribing hook fires
  → /portfolio/full, /analytics/ratios, /quant/full re-fetch with new mode
  → dashboard re-renders from new data
```

### "What changed" flow
```
/changes → useSnapshots() + useDelta() → compares latest vs previous
  → sector deltas, added/removed tickers, weight changes
  → link to /advisor?q=... for AI explanation of the change
```

---

## 7. External services (complete list)

| Service | Used by | Required for MVP? | Graceful degradation? |
|---|---|---|---|
| yfinance | market, quant, fundamentals, peers, live provider, sector enrichment | **Yes** — core | Partial per-ticker, yes |
| SQLite | portfolio, holdings, snapshots, watchlist | **Yes** — core | N/A (local file) |
| FMP | fundamentals fallback, peer discovery fallback | No (optional) | Yes — absent = use static map |
| NewsAPI | `/news` | No (optional) | Yes — absent = `news_unavailable=True` |
| Anthropic (Claude) | AI advisor | No (optional) | Yes — fallback to local rule-based |
| OpenAI | AI advisor (alt provider) | No (optional) | Yes — fallback to local rule-based |
| Zerodha | broker sync | No — scaffold only | N/A |
| IBKR | broker sync | No — scaffold only | N/A |

---

## 8. Known architecture issues (cross-linked)

Full treatment in [module-contract-blueprint.md §Cross-cutting issues](./module-contract-blueprint.md#cross-cutting-issues-read-this-before-any-module-rebuild). Short list:

1. **In-process caches** — lost on restart, not shared across workers. Move to Redis/DB before beta scaling.
2. **Risk logic lives in TypeScript** — should be backend-owned and shipped inside `/portfolio/full`.
3. **Two advisor engines, one shape** — same query produces different answers depending on LLM configuration.
4. **`usePortfolio` re-fetches per page** — no shared context; redundant fetches on every navigation.
5. **Active portfolio state is split** between `portfolioStore.activePortfolioId` (frontend) and `Portfolio.is_active` (DB).
6. **Provider contract is informal** — providers attach extra optional fields inconsistently.
7. **Scaffold pages are still routed** — `/simulate`, `/brokers`, `/frontier`, `/ai-chat` mount expensive hooks on load.
8. **No Alembic** — manual column migrations will not survive a PostgreSQL migration.
9. **No per-ticker timeout on `/analytics/ratios` and `/peers/{ticker}`** — documented in status doc §7.1 / §7.2.
10. **No persistent enrichment job state** — app restart during enrichment orphans holdings at `pending`.

---

## 9. Production readiness (honest)

| Concern | Ready for private beta? | Blocker before public? |
|---|---|---|
| Auth | N/A (single-user by design) | Yes, if going multi-tenant |
| DB migrations | Manual, works | Alembic required |
| Caches | In-process only | Redis required for >1 worker |
| Observability | Logs only, no metrics | Prometheus/OpenTelemetry needed |
| Error reporting | None | Sentry (or equivalent) needed |
| Backups | Manual SQLite copy | Scheduled backup required |
| Rate limits | None | Needed if exposed |
| File upload size limits | None visible | Needed |
| Enrichment resume | None | Needed — data loss risk |
| Daily snapshots | Manual or upload-triggered | Cron needed for history |

The "single-user, self-hosted" framing buys a lot of these as "future work". But **private beta on a shared instance** still needs Redis + error reporting + a daily snapshot cron + the documented timeout guards.

---

## 10. Where to go next

- For per-module contracts and failure modes → [module-contract-blueprint.md](./module-contract-blueprint.md).
- For exact endpoint ↔ hook ↔ provider wiring → [data-flow-and-dependency-map.md](./data-flow-and-dependency-map.md).
- For MVP / private-beta scope decisions → [product-requirements-mvp.md](./product-requirements-mvp.md).
- For the ranked rebuild plan → [refactor-rebuild-blueprint.md](./refactor-rebuild-blueprint.md).
- For per-module implementation specs → [feature-specs/](./feature-specs/).
