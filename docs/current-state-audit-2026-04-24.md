# P-Insight Current-State Audit

Date: 2026-04-24

Scope: read-only audit of the repository as checked out in `/Users/dhruvtantia/Documents/Codex/P-insight`. No source code or product behavior was changed.

## Executive Summary

P-Insight is a local-first portfolio intelligence platform focused on Indian equity portfolios. The product lets a user upload a broker/manual CSV or Excel file, normalizes holdings, enriches them with price, sector, fundamentals, peer, news, history, and risk data, then presents the result through a Next.js dashboard and analysis workspace.

The application is a two-app monorepo:

- Frontend: Next.js 15, React 18, TypeScript, Tailwind, Zustand, Recharts, lucide-react.
- Backend: FastAPI, SQLAlchemy, SQLite by default, Pydantic v2, pandas/numpy, yfinance/FMP/NewsAPI optional integrations.
- Data model: portfolios, holdings, watchlist, snapshots, snapshot holdings, broker connections, portfolio daily history, benchmark daily history.
- Data modes: `uploaded`, `live`, and `broker`; `mock` code remains in places but is intentionally disabled in runtime mode selection.

The strongest implemented areas are upload ingestion, portfolio aggregation, dashboard/holdings/fundamentals/risk presentation, portfolio management, snapshots/changes, watchlist, market overview, and the provider abstraction. The more experimental or scaffolded areas are broker sync, standalone `/ai-chat`, deprecated `/frontier`, and parts of news events/calendar coverage.

## Repository Inventory

Observed high-level structure:

```text
.
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/      FastAPI route modules
│   │   ├── analytics/             returns/risk/correlation/benchmark/quant logic
│   │   ├── connectors/            broker connector interfaces and scaffolds
│   │   ├── core/                  config and dependency injection
│   │   ├── data_providers/        uploaded/live/broker/mock provider classes
│   │   ├── db/                    SQLAlchemy engine/session/init
│   │   ├── ingestion/             upload parsing, normalization, enrichment
│   │   ├── lib/                   delta calculations
│   │   ├── models/                SQLAlchemy ORM models
│   │   ├── optimization/          expected returns, covariance, optimizer, frontier
│   │   ├── repositories/          DB access wrappers
│   │   ├── schemas/               Pydantic API contracts
│   │   └── services/              business logic services
│   ├── mock_data/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/app/                   Next.js App Router pages
│   ├── src/components/            feature and layout components
│   ├── src/context/               shared PortfolioContext
│   ├── src/hooks/                 data hooks
│   ├── src/lib/                   frontend calculators and rule engines
│   ├── src/services/api.ts        typed API client
│   ├── src/store/                 Zustand stores
│   └── package.json
└── docs/                          architecture, status, feature specs, blueprints
```

Approximate code volume from `wc -l`: 49,254 lines across backend app and frontend source files. Notable large files are `frontend/src/components/debug/SystemDiagnosticsPanel.tsx`, `frontend/src/types/index.ts`, `frontend/src/lib/advisor.ts`, `backend/app/ingestion/sector_enrichment.py`, `backend/app/data_providers/live_provider.py`, `frontend/src/app/changes/page.tsx`, and `frontend/src/app/upload/page.tsx`.

## Product Surface

Visible sidebar routes:

- Core: `/market`, `/dashboard`, `/holdings`, `/fundamentals`, `/risk`, `/changes`.
- Secondary: `/peers`, `/news`, `/watchlist`, `/portfolios`, `/upload`, `/advisor`.
- Development-only: `/debug` when `NODE_ENV=development`.

Routed but hidden/scaffold/deprecated routes:

- `/screener`, `/simulate`, `/optimize`, `/brokers`, `/sectors`, `/frontier`, `/ai-chat`.

Backend API route groups:

- System: `/`, `/health`, `/readiness`.
- Portfolio: `/api/v1/portfolio/full`, `/portfolio/`, `/portfolio/summary`, `/portfolio/sectors`, legacy `/portfolio/upload`.
- Upload: `/api/v1/upload/parse`, `/upload/confirm`, `/upload/v2/confirm`, upload enrichment polling endpoints.
- Portfolio management: `/api/v1/portfolios/`, `/active`, `/{id}`, `/{id}/activate`, `/{id}/refresh`, `/{id}/rename`, `DELETE /{id}`.
- Snapshots: create/list/detail/delta/delete.
- History: canonical `/api/v1/history/{portfolio_id}/status` and `/daily`, plus legacy portfolio history and benchmark paths.
- Analytics: `/analytics/risk`, `/analytics/ratios`, `/analytics/commentary`.
- Quant: `/quant/full`, `/quant/status`.
- Optimization: `/optimization/full`, `/optimization/status`.
- Market/live: `/market/overview`, `/live/quotes`, `/live/fundamentals`, deprecated `/live/indices`, `/live/status`.
- Peers/news/watchlist/advisor/brokers/ai-chat/frontier route groups.

## Implemented Data Flow

Primary uploaded-mode flow:

1. User uploads CSV/XLSX on `/upload`.
2. Frontend calls `POST /api/v1/upload/parse`.
3. Backend reads the file into pandas, detects candidate columns, returns preview and mapping metadata.
4. User confirms mapping.
5. Frontend calls `POST /api/v1/upload/v2/confirm`.
6. Backend validates rows into accepted, rejected, and warning rows.
7. Accepted holdings are persisted into a new active portfolio with enrichment pending.
8. In-memory uploaded holdings cache is updated immediately so the UI can render.
9. Background enrichment runs yfinance/FMP/static mapping, writes enrichment status to DB, pre-warms quant data, and builds portfolio history.
10. Frontend navigates to dashboard and polls enrichment/status paths where needed.

Core page load flow:

1. `AppShell` mounts `PortfolioProvider`.
2. `PortfolioProvider` calls `/api/v1/portfolio/full` once per data-mode change.
3. The response includes holdings, summary, sectors, backend-computed risk snapshot, fundamentals availability summary, and provenance metadata.
4. Pages call `usePortfolio()` as a context consumer rather than independently fetching the portfolio bundle.
5. Additional heavy modules fetch their own dedicated bundles: fundamentals ratios, quant analytics, optimization, snapshots/history, peers, news, watchlist.

## Backend Architecture Findings

The backend uses a clean route/service/provider/repository split in many core areas:

- `app/main.py` owns FastAPI setup, CORS, docs toggle, lifespan DB init, health/readiness.
- `app/core/config.py` centralizes environment settings.
- `app/core/dependencies.py` resolves data providers from `mode`.
- Route handlers are grouped in `app/api/v1/endpoints`.
- Provider interface is defined by `BaseDataProvider`.
- Business logic lives mostly in services: portfolio, portfolio manager, snapshot, history, upload v2, advisor, broker.
- Analytics and optimization are separate from route modules.

Important backend details:

- SQLite is the default database. PostgreSQL is documented as the production target, but migrations are not present in the inspected tree.
- `init_db()` creates tables and applies lightweight additive schema guards.
- `mock` mode is disabled through dependency validation, but `MockDataProvider` and mock schema defaults remain in the codebase.
- Quant analytics uses in-process caches for computed results and raw history.
- History build status uses in-process status tracking plus durable DB rows for historical values.
- Advisor can use Anthropic, OpenAI, or a fallback provider depending on configured keys.

## Backend Module Isolation Update

Updated: 2026-04-25

The backend remains a modular monolith, but the core feature boundaries are now more explicit:

- Portfolio aggregation is owned by `PortfolioReadService`, which provides active/default portfolio lookup, holdings reads, summary, sector allocation, and concentration risk calculations.
- Upload confirmation now persists the base portfolio and passes an `UploadCompleted` payload into `PostUploadWorkflow` for post-upload side effects.
- Canonical history endpoints expose only `building`, `complete`, `failed`, and `not_started`; legacy internal labels are mapped before reaching frontend-facing fields.
- Quant cache and history build status are accessed through `TimedMemoryCache` and `HistoryBuildStatusStore` wrappers.
- Advisor context building consumes `PortfolioReadService` and `SnapshotReadService` rather than querying portfolio/snapshot internals directly.
- Backend contract tests now cover system, portfolio, upload, history, cache/status, and advisor-boundary behavior.

See `docs/backend-module-contracts.md` for ownership, inputs, outputs, and safe-edit rules.

## Frontend Architecture Findings

The frontend is a Next.js App Router app with a persistent application shell:

- `RootLayout` wraps children in `AppShell`.
- `AppShell` renders sidebar/topbar and mounts `PortfolioProvider`.
- `PortfolioContext` is now the shared source for portfolio bundle data.
- Zustand stores manage data mode, portfolio list/active id, filters, and simulation state.
- `frontend/src/services/api.ts` centralizes most typed backend calls and API error classification.
- Some pages still use direct `fetch` where form data or polling is specialized.

The UI is organized by feature directories: upload, modules, risk, fundamentals, peers, portfolio, news, broker, advisor, optimization, simulation, dashboard, common, and layout.

## Persistence Model

Tables observed in SQLAlchemy models:

- `portfolios`: portfolio metadata, source, active flag, filename, sync metadata.
- `holdings`: ticker, quantity, costs, price, sector, enrichment/fundamentals/peers statuses.
- `watchlist`: ticker, tag, sector, target price, notes.
- `snapshots`: immutable portfolio point-in-time summary with JSON blobs for sectors/risk/top holdings.
- `snapshot_holdings`: holdings inside a snapshot.
- `broker_connections`: broker connection state and non-secret config.
- `portfolio_history`: synthetic daily portfolio value series by portfolio and date.
- `benchmark_history`: benchmark close price history by ticker and date.

## Verification Results

Commands run during the audit:

- `pnpm type-check` in `frontend/`: failed.
- `poetry run python -m compileall app` in `backend/`: passed after Poetry was allowed to use its virtualenv cache.
- `poetry run pytest` in `backend/`: failed because `pytest` was not installed in the created Poetry environment.

Post-isolation verification on 2026-04-25:

- `pnpm type-check` in `frontend/`: passed.
- `poetry run python -m compileall app` in `backend/`: passed.
- `poetry run pytest` in `backend/`: passed.

Frontend type errors observed:

- `frontend/src/app/changes/page.tsx`: comparisons against `"pending"` are incompatible with the current union type `"failed" | "building" | "complete" | "not_started" | null`.
- `frontend/src/store/dataModeStore.ts`: Zustand `persist` typing rejects the `partialize` and `merge` signatures.

Backend verification notes:

- `compileall` completed successfully.
- The first sandboxed Poetry run could not write to the Poetry cache outside the workspace; rerunning with approval allowed the compile check to proceed.
- `pytest` appears declared under Poetry dev dependencies but was not available in the created environment, suggesting dependencies are not installed or the Poetry environment is incomplete.

## Major Risks And Gaps

- In-process caches are used for quant, uploaded holdings, live provider data, and history build status; process restart can still affect freshness/status visibility. Quant cache and history build status now have wrapper services, but they are still process-local.
- Broker sync is architected but not production implemented.
- News events/calendar support is still weak and depends on optional external providers.
- Some frontend direct fetches bypass the central API helper for form-data and local market/upload flows.
- Some mock-mode references and mock fallback UI affordances remain even though mock mode is disabled.

## Recommended Documentation Maintenance

- Treat this audit as the current-state baseline.
- Keep `docs/architecture-design-current.md`, `docs/technical-design-current.md`, and `docs/feature-specification-current.md` synchronized with code before major changes.
- Update or retire older docs that refer to now-fixed items, especially shared portfolio context and history endpoints.
- Add a release gate that requires frontend type-check, backend compile/import check, and a working backend test environment.
