# P-Insight Technical Design

## Technology Stack

Frontend:

- Next.js `^15.0.0`
- React `^18.3.1`
- TypeScript `^5.6.0`
- Tailwind CSS `^3.4.0`
- Zustand `^5.0.0`
- Recharts `^2.13.0`
- lucide-react `^0.460.0`

Backend:

- Python `^3.11` in `pyproject.toml`
- FastAPI `^0.115.0`
- Uvicorn `^0.32.0`
- SQLAlchemy `^2.0.0`
- Pydantic `^2.0.0`
- Pydantic Settings `^2.6.0`
- pandas, numpy, python-multipart, aiofiles, openpyxl
- yfinance and httpx for data provider integrations

Storage:

- SQLite default via `DATABASE_URL=sqlite:///./p_insight.db`
- PostgreSQL documented as production target, but no migration system was observed in the current tree.

## Backend Startup

`backend/app/main.py` creates the FastAPI app and performs:

- logging setup from `settings.LOG_LEVEL`;
- lifespan startup/shutdown logging;
- `init_db()` on startup;
- CORS allow-list from `settings.cors_origins()`;
- versioned API router inclusion;
- `/health`, `/readiness`, and `/` system routes;
- optional Swagger/ReDoc depending on `DOCS_ENABLED`.

`backend/main.py` exists as a top-level compatibility entry point.

## Configuration

Primary settings live in `backend/app/core/config.py`:

- application: `APP_NAME`, `APP_VERSION`, `APP_ENV`, `DEBUG`, `LOG_LEVEL`, `DOCS_ENABLED`;
- CORS: `ALLOWED_ORIGINS`, `FRONTEND_URL`;
- database: `DATABASE_URL`;
- data mode: `DEFAULT_DATA_MODE`;
- feature flags: `LIVE_API_ENABLED`, `BROKER_SYNC_ENABLED`, `AI_CHAT_ENABLED`, `ADVANCED_ANALYTICS_ENABLED`;
- keys: Alpha Vantage, FMP, NewsAPI, OpenAI, Anthropic, Zerodha.

Important current-state mismatch: `backend/.env.example` still shows `DEFAULT_DATA_MODE=mock`, while runtime dependency code rejects `mock` mode. Documentation and env examples should be aligned to `uploaded`.

## API Router Map

All versioned endpoints are mounted under `/api/v1`.

| Router file | Prefix | Purpose |
|---|---:|---|
| `market.py` | `/market` | Market overview, indices, movers, headlines placeholder |
| `portfolio.py` | `/portfolio` | Bundled portfolio, holdings, summary, sectors, legacy upload |
| `analytics.py` | `/analytics` | Risk scaffold, fundamentals ratios, commentary |
| `watchlist.py` | `/watchlist` | Watchlist CRUD |
| `peers.py` | `/peers` | Peer comparison and rankings |
| `news.py` | `/news` | Portfolio news and corporate events |
| `frontier.py` | `/frontier` | Deprecated scaffold |
| `ai_chat.py` | `/ai-chat` | Standalone scaffold chat |
| `advisor.py` | `/advisor` | AI advisor status, ask, context preview |
| `live.py` | `/live` | Quotes, fundamentals, provider status, deprecated indices |
| `quant.py` | `/quant` | Full quant bundle and status |
| `optimization.py` | `/optimization` | Optimization bundle and status |
| `upload.py` | `/upload` | Upload parse/confirm/v2/status |
| `portfolios_mgmt.py` | `/portfolios` | Portfolio list, active, create, refresh, rename, delete |
| `snapshots.py` | mixed `/portfolios` and `/snapshots` paths | Snapshot CRUD and deltas |
| `brokers.py` | `/brokers` | Broker connector scaffold |
| `history.py` | mixed `/history` and legacy `/portfolios` paths | Portfolio history, benchmark, holdings status |

## Core API Contracts

### `/api/v1/portfolio/full`

Backend returns the main application bundle:

- holdings with derived market value, P&L, P&L percent, weight;
- summary KPIs;
- sector allocation;
- backend-computed risk snapshot;
- fundamentals availability summary;
- meta including mode, portfolio id/name, as-of timestamp, lifecycle state, incomplete/degraded flags.

Frontend consumer: `PortfolioProvider`.

### `/api/v1/upload/parse`

Accepts a file and returns:

- detected column candidates;
- preview rows;
- parsing warnings/errors;
- mapping candidates for ticker, quantity, cost, price, sector, etc.

Frontend consumer: `/upload` page and refresh panel.

### `/api/v1/upload/v2/confirm`

Accepts a file and confirmed mapping, validates rows, persists a new active portfolio, starts background enrichment, and returns accepted/rejected/warning status.

The v2 design separates fast persistence from slow enrichment.

### `/api/v1/analytics/ratios`

Returns per-holding fundamentals, weighted portfolio-level fundamentals, backend threshold constants, and coverage metadata.

### `/api/v1/quant/full`

Returns a full market-risk bundle:

- risk metrics;
- benchmark metrics;
- cumulative return;
- drawdown series;
- per-holding contribution stats;
- correlation matrix;
- meta with coverage, cached status, excluded tickers, benchmark availability.

### `/api/v1/history/{portfolio_id}/status` and `/daily`

Canonical DB-aware endpoints for historical portfolio value. They distinguish complete, building, failed, and not-started states and survive backend restart when DB rows exist.

## Database Design

SQLAlchemy models:

- `Portfolio`
- `Holding`
- `Watchlist`
- `Snapshot`
- `SnapshotHolding`
- `BrokerConnection`
- `PortfolioHistory`
- `BenchmarkHistory`

Relationships:

- portfolio has many holdings;
- portfolio has many snapshots;
- snapshot has many snapshot holdings;
- broker connection belongs to a portfolio;
- portfolio history rows belong to a portfolio.

The current schema is created by `init_db()`. There is no Alembic migration tree in the inspected repository.

## Upload And Enrichment Pipeline

Main files:

- `backend/app/api/v1/endpoints/upload.py`
- `backend/app/services/upload_v2_service.py`
- `backend/app/ingestion/normalizer.py`
- `backend/app/ingestion/column_detector.py`
- `backend/app/ingestion/sector_enrichment.py`

V2 stages:

1. Parse file into DataFrame.
2. Detect/map columns.
3. Classify rows as accepted, rejected, or accepted-with-warning.
4. Persist portfolio and holdings with `enrichment_status="pending"`.
5. Update uploaded holdings in-memory cache.
6. Create upload snapshot.
7. Background enrichment:
   - resolve ticker/name/sector;
   - fetch prices/fundamentals where available;
   - update DB statuses;
   - pre-warm quant cache;
   - build portfolio history.

## Quant Design

Main file: `backend/app/analytics/quant_service.py`.

The quant service:

- fetches holdings from the active provider;
- downloads or derives price histories;
- builds a price matrix;
- excludes unusable tickers with reasons;
- computes returns, volatility, Sharpe, Sortino, drawdown, beta, tracking error, information ratio, alpha, VaR, correlation;
- handles unavailable benchmark data by returning null relative metrics rather than synthetic fallback;
- caches computed bundles by mode and period;
- caches raw one-year histories by mode and slices them for shorter periods.

## Optimization Design

Main files:

- `backend/app/optimization/optimizer_service.py`
- `expected_returns.py`
- `covariance.py`
- `objectives.py`
- `frontier.py`
- `types.py`

The optimizer fetches historical prices, estimates returns/covariance, computes efficient frontier points, min-variance and max-Sharpe portfolios, current portfolio point, and rebalance deltas. The frontend exposes this mainly through hidden/beta routes.

## Advisor Design

Main files:

- `backend/app/services/ai_advisor_service.py`
- `backend/app/services/context_builder.py`
- `backend/app/services/ai/provider.py`
- `frontend/src/hooks/useAdvisor.ts`
- `frontend/src/app/advisor/page.tsx`
- `frontend/src/lib/advisor.ts`

Backend advisor flow:

1. Resolve portfolio id.
2. Build context from holdings, summary, sectors, risk, snapshots, recent changes, and source metadata.
3. Render a textual system prompt.
4. Call Anthropic, OpenAI, or fallback provider.
5. Parse strict JSON response into `AIAdvisorResponse`.

Frontend fallback:

- If backend returns `fallback_used=true`, frontend uses local rule-based query routing in `frontend/src/lib/advisor.ts`.

## Frontend State Design

### PortfolioProvider

`frontend/src/context/PortfolioContext.tsx` is the canonical frontend portfolio data provider. It fetches `/portfolio/full` once per mode change, preserves stale data after failed refreshes, and exposes a shared `refetch`.

### Zustand Stores

- `dataModeStore`: persisted data mode with guards against disabled mock/broker modes.
- `portfolioStore`: active portfolio id and portfolio list, not persisted.
- `filterStore`: session-only sector filters.
- `simulationStore`: session-only simulation edits.

### API Client

`frontend/src/services/api.ts` centralizes most calls, with typed namespaces for portfolio, analytics, frontier, watchlist, peers, news, chat, quant, live, optimization, portfolios, snapshots, broker, advisor, history, and system health.

The API helper uses a 15-second timeout and classifies errors as network, timeout, not found, server, client, parse, or unknown.

## Validation Status

Frontend:

- `pnpm type-check` currently fails.
- Failing files: `frontend/src/app/changes/page.tsx`, `frontend/src/store/dataModeStore.ts`.

Backend:

- `poetry run python -m compileall app` passes.
- `poetry run pytest` could not run because `pytest` was not installed in the created Poetry environment.

## Technical Debt

- TypeScript compile errors block clean release verification.
- Poetry environment/dev dependency setup needs repair.
- Migration strategy is absent.
- Process-local caches/status maps need production replacement.
- Some mock references remain in schemas, docs, debug UI, comments, and provider code.
- Some route/docs comments still describe earlier architecture states.
- Some direct frontend fetch calls bypass `apiFetch`, usually for form-data flows.
- Broker connectors remain scaffolded.
