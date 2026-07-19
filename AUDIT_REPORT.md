# P-Insight — Comprehensive Codebase Audit & Assessment

**Audit date:** 2026-07-17
**Auditor:** Claude Code (independent verification pass)
**Repository:** P-insight (branch `phase-1-public-surface-cleanup`, remote `github.com/dhruvtantia/P-insight-Beta-version`)

---

## Verification Status (read this first)

Every headline claim below was checked against the current working tree, not inherited on trust. The following commands were executed live during this audit:

| Check | Command | Result |
|---|---|---|
| Backend tests | `backend/.venv/bin/python -m pytest backend/tests -q` | **64 passed, 17 warnings, 3.52s** ✅ |
| Frontend type-check | `npm run type-check` (`tsc --noEmit`) | **Pass, exit 0** ✅ |
| Frontend build | `npm run build` | **Pass, 24 static routes** ✅ |

**Two honesty caveats:**

1. **No PDFs exist.** The original audit brief asked me to read all `.pdf` files in `docs/`. A repository-wide search (`find . -iname "*.pdf"`) returns nothing. The product vision was therefore reconstructed from the Markdown docs in `docs/` plus the root `README.md`, per the user's clarification. This is a documentation format difference, not a missing-vision problem — the Markdown specs are detailed and authoritative.
2. **Remote-git comparison is partially stale.** The last `git fetch` recorded in this checkout is dated 27 May 2026; a fresh fetch was not performed during this audit. Local-vs-remote statements in Phase 6 reflect that snapshot and are flagged where it matters.

This report also **supersedes and consolidates** four prior audits already in the repo (`ARCHITECTURE_AUDIT.md` 2026-04-27, `codebase-audit-2026-05-24/`, `codebase-audit-2026-05-27/`, `codebase-audit-2026-06-27.md`). Where my findings differ from theirs, I say so.

---

## Executive Summary

P-Insight is a **functionally rich, well-architected, single-user portfolio analytics web application** that is **not yet ready for public multi-user deployment**. The core loop — upload a broker CSV, enrich it, and analyze holdings, sectors, risk, fundamentals, peers, optimization, and history — genuinely works end to end. The engineering discipline is above average for a solo project: clean service boundaries, a feature registry for graceful degradation, honest "unavailable/partial/stale" data states, and a real backend contract-test suite.

The gap between vision and reality is not in *feature breadth* — nearly all 22 specified features have at least partial implementations. The gap is in **production-grade foundations**: there is no authentication or user isolation of any kind, no database migration system, and several headline "intelligent" capabilities (AI advisor, efficient-frontier optimizer) silently run in degraded fallback mode because their scientific/LLM dependencies are not installed.

### Web-deployment readiness score: **4.5 / 10**

This aligns with the prior audit's 44/100 but is re-justified against the current tree. It is *not lower* because the local application is coherent, tested, and honest about data quality. It is *not higher* because the security, persistence, and dependency gaps below are true blockers for any real user beyond the developer.

### Top 3 gaps between vision and implementation

1. **"Multi-user product" vs. single-global-state reality.** The spec and README describe per-user portfolios; the code has **zero authentication and no `user_id`/owner column on any table**. A shared deployment would mix every user's data into one global portfolio and one global watchlist.
2. **"AI-driven advisor" vs. rule-based-only reality.** The README markets natural-language LLM insights. The `anthropic` and `openai` packages are **not installed and are commented out** in `pyproject.toml`; the provider layer soft-imports them and can never succeed. The advisor is effectively a deterministic rule engine.
3. **"Mathematically optimized allocations / efficient frontier" vs. Monte-Carlo fallback.** `scipy`, `sklearn`, and `PyPortfolioOpt` are **not installed**. The optimizer silently degrades to sampling 12,000 random weight vectors and a plain sample-covariance matrix. Results are plausible but not the SLSQP-optimized frontier the UI implies.

### Top 5 priorities before web launch

1. **Add authentication, authorization, and tenancy** (user model + ownership columns on all data tables + route guards). This is the single largest blocker.
2. **Replace ad-hoc schema evolution with Alembic migrations** and move the default database to PostgreSQL for production.
3. **Resolve the dependency honesty gap**: either install `scipy`/`sklearn`/`anthropic`/`openai` and declare them in `pyproject.toml`, or change the UI/README to stop implying capabilities that are not active.
4. **Harden the external-data layer**: yfinance is a single point of failure for prices, fundamentals, history, market data, peers, quant, and optimization. Add caching, retry, and provider-health fallback.
5. **Make background enrichment durable** (a job table with retry/resume) and add frontend/E2E tests (currently zero).

### Estimated effort to production-ready

Roughly **8–14 focused engineer-weeks** for a genuine multi-user MVP: ~3–4 weeks for auth/tenancy/migrations, ~2–3 weeks for provider hardening + durable jobs, ~2 weeks for dependency/deployment cleanup and secrets, ~2–3 weeks for a frontend/E2E test suite and QA. This assumes the existing feature surface is kept as-is and only made production-safe, not expanded.

---

## Phase 1 — The Vision

*Source: `docs/product-functional-specification.md` (dated 2026-05-01), `docs/ARCHITECTURE_AUDIT.md`, `docs/backend-module-contracts.md`, and `README.md`. No PDFs exist in the repository.*

### Core functionality

P-Insight is meant to be a retail investor's **primary portfolio insight workspace** — "institutional-grade insights without institutional tools." It transforms a single portfolio upload into a full analytical stack covering performance, allocation, risk, fundamentals, peers, history, optimization, simulation, and AI-assisted decision support. The explicit product promise is to answer four recurring questions:

1. What do I own, and how is it performing?
2. Where are the major risks, concentrations, and weak points?
3. Which holdings deserve more research, trimming, adding, or replacement?
4. What would happen if I changed my allocation?

A stated non-goal: it is **not** a trading-execution product. It produces insight, education, and scenario analysis, not orders.

### Target user and financial goals

- **Who:** Indian retail equity investors managing portfolios roughly **₹10 lakh – ₹5 crore**.
- **Goal:** "Upload once → understand your portfolio in under 30 seconds → return weekly."
- **Market scope:** Indian equities (NIFTY 50 as the default benchmark); US expansion is a roadmap item only.

### Key features (as specified)

The functional spec enumerates **22 feature modules** with explicit data contracts and failure behavior: App Shell/Navigation, Feature Registry, Portfolio Core, Upload/Import, Portfolio Management/Refresh, Dashboard, Holdings, Sector Allocation, Fundamentals/Valuation, Peer Comparison, Risk/Quant Analytics, Optimization/Efficient Frontier, Simulation/Rebalancing, History/Changes/Snapshots, Market Overview, News/Corporate Events, Watchlist, AI Advisor Q&A, Action Center/Recommendations, Broker Sync, Stock Screener, and Diagnostics.

### Data inputs and outputs

- **Inputs:** broker/manual CSV or Excel uploads (with fuzzy column detection), optional future broker sync, user watchlist entries, and advisor natural-language queries.
- **Outputs:** a canonical `PortfolioBundle` (holdings + summary + sectors + risk snapshot + fundamentals coverage + freshness metadata), plus per-feature analytics responses (`FundamentalsResponse`, `QuantAnalytics`, `OptimizationResult`, `ScenarioComparison`, `PortfolioDelta`, `MarketOverview`, `AdvisorResponse`, etc.).
- **Non-negotiable data contract:** every analytics response must expose data coverage/freshness; missing data must **never** be silently converted into zeros; the advisor must never invent unavailable metrics.

### Financial calculations required

- Per-holding: market value, total cost, P&L, P&L %, portfolio weight.
- Concentration: HHI, top-3 weight, single-stock max, diversification score.
- Risk/quant: annualized volatility & return, Sharpe, Sortino, max drawdown, downside deviation, VaR 95%, beta, tracking error, information ratio, alpha, correlation matrix.
- Fundamentals: PE, forward PE, PB, EV/EBITDA, PEG, dividend yield, ROE, ROA, margins, revenue/earnings growth, debt-to-equity — plus weight-averaged portfolio-level versions with outlier exclusion.
- Optimization: expected returns, covariance, minimum-variance and maximum-Sharpe portfolios, efficient frontier, and rebalance deltas.

### User journey

Empty state → upload/parse/map/confirm → portfolio usable immediately while background enrichment (prices, sectors, fundamentals, peers) and history-building run → dashboard summary + action center → drill into holdings, sectors, fundamentals, peers, risk → simulate rebalancing / run optimizer → ask the advisor → save snapshots and track change over time. The intended cadence is a weekly or monthly review loop.

---

## Phase 2 — Codebase Analysis

### Project structure

```
P-insight/
├── backend/                     FastAPI application (Poetry-managed)
│   ├── app/
│   │   ├── api/v1/endpoints/     18 route modules, 60 endpoints
│   │   ├── analytics/           risk, returns, correlation, benchmark, quant, commentary
│   │   ├── optimization/        expected returns, covariance, objectives, frontier, optimizer
│   │   ├── services/            ~20 service classes (upload, portfolio, snapshot, advisor, …)
│   │   ├── data_providers/      uploaded / live / broker / (disabled) mock
│   │   ├── ingestion/           column detection, normalization, sector enrichment
│   │   ├── connectors/          Zerodha / IBKR broker scaffolds
│   │   ├── repositories/        portfolio, watchlist, snapshot repos
│   │   ├── models/              SQLAlchemy ORM (8 tables)
│   │   ├── schemas/             Pydantic v2 request/response contracts
│   │   ├── core/                config + dependencies
│   │   └── db/                  engine/session + init_db (create_all + ad-hoc ALTER)
│   ├── tests/                   ~15 contract test modules (64 tests)
│   ├── alembic/                 ⚠️ contains only .DS_Store — no migrations
│   └── pyproject.toml
├── frontend/                    Next.js 15 App Router (pnpm lockfile; npm also works)
│   └── src/
│       ├── app/                 21 route pages
│       ├── components/          21 domain component folders
│       ├── hooks/               per-feature data hooks
│       ├── services/api.ts      central API client
│       ├── store/               Zustand stores (dataMode, portfolio, filter, simulation)
│       ├── lib/                 client-side domain logic (advisor, insights, risk, simulation)
│       └── types/               hand-maintained TS contracts (+ generated OpenAPI types)
├── docs/                        specs + 4 prior audit packages + smoke checklists
├── older version docs/          (staged for deletion in working tree)
└── README.md
```

**File counts (verified):** 121 backend Python files, 150 frontend TS/TSX files.

### Main backend modules and purposes

| Layer | Location | Purpose |
|---|---|---|
| API routers | `app/api/v1/endpoints/*` | 60 HTTP endpoints grouped by domain |
| Services | `app/services/*` | Business workflows (upload parse/confirm/v2, portfolio read/manage, snapshots, history, fundamentals view, advisor, context builder, price enrichment, feature registry, cache, job status) |
| Analytics | `app/analytics/*` | Pure pandas/numpy risk, returns, correlation, benchmark, quant bundle, commentary |
| Optimization | `app/optimization/*` | Expected returns, covariance, objective functions, frontier, optimizer service |
| Data providers | `app/data_providers/*` | `uploaded` (DB-backed), `live` (yfinance), `broker` (scaffold); `mock` explicitly rejected with HTTP 400 |
| Ingestion | `app/ingestion/*` | Column detection, ticker normalization, sector enrichment |
| Repositories | `app/repositories/*` | Portfolio, watchlist, snapshot data access |

### Data models & database schema

SQLAlchemy 2 (sync ORM), SQLite by default (`sqlite:///./p_insight.db`). **8 tables**, none of which carry an owner/user identifier:

| Table | Key columns | Notes |
|---|---|---|
| `portfolios` | id, name, source, **is_active**, description, upload_filename, last_synced_at, source_metadata | `is_active` is a **global** flag — one active portfolio for the whole system |
| `holdings` | id, portfolio_id (FK), ticker, quantity, average_cost, current_price, price_status, price_source, sector, + enrichment metadata (normalized_ticker, sector_status, fundamentals_status, peers_status, enrichment_status, failure_reason) | Rich per-holding enrichment/status tracking |
| `watchlist` | id, **ticker (unique)**, name, tag, sector, target_price, notes | Unique-ticker constraint = a **single global** watchlist |
| `snapshots` | id, portfolio_id, label, captured_at, totals, JSON blobs (sectors, risk, top holdings) | Point-in-time records |
| `snapshot_holdings` | immutable holding rows per snapshot | |
| `broker_connections` | portfolio_id, broker_name, connection_state, account_id, sync metadata | Scaffold only |
| `portfolio_history` | portfolio_id, date, total value | Daily history |
| `benchmark_history` | ticker, date, close | Benchmark series |

Schema is created via `Base.metadata.create_all` plus idempotent `ALTER TABLE ADD COLUMN` calls wrapped in try/except inside `init_db.py`. **There is no Alembic migration history** (the `alembic/` directory holds only a `.DS_Store`).

### API endpoints

**60 endpoints** across 18 routers under `/api/v1`, plus `/health`, `/readiness`, `/`. Distribution: portfolios-management (8), history (7), upload (5), snapshots (5), portfolio (5), brokers (5, gated), watchlist (4), live (4), analytics (3), advisor (3), quant (2), optimization (2), news (2), and single-endpoint routers for market, peers, system, frontier (deprecated), and ai-chat (disabled).

### External integrations

- **yfinance** — primary and dominant source for prices, fundamentals, history, market indices, peers, quant inputs, and optimization inputs. Installed (v0.2.66).
- **Financial Modeling Prep (FMP)** — optional fundamentals fallback (API-key gated).
- **NewsAPI** — optional news provider (API-key gated).
- **OpenAI / Anthropic** — advisor LLM providers, **soft-imported, not installed** (see Phase 4).
- **Zerodha / IBKR** — broker connectors, scaffolded and disabled.

### Frontend components

21 route pages and 21 domain component folders (layout, modules, charts, risk, fundamentals, optimization, simulate, portfolio, upload, watchlist, peers, news, advisor, broker, debug, action, insights, common, ui). State via Zustand (data mode, active portfolio, dashboard filters, simulation sandbox) and a `PortfolioContext` provider. No server-state library (React Query/SWR) — fetch lifecycles are hand-rolled, and some pages/hooks bypass the central API client with direct `fetch` (e.g. `fundamentals/page.tsx`, `watchlist/page.tsx`, `risk/page.tsx`, several hooks).

### Tech stack (verified)

- **Backend:** Python 3.12 (venv), FastAPI 0.115, Pydantic v2, SQLAlchemy 2, Uvicorn, pandas 2.3, numpy 1.26, yfinance 0.2.66, httpx, openpyxl, python-multipart. Poetry-managed.
- **Frontend:** Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, Zustand, Recharts, lucide-react, clsx/tailwind-merge. Node 25, pnpm lockfile.
- **Database:** SQLite (dev default); PostgreSQL intended for production but not wired up.
- **Testing:** pytest + FastAPI TestClient (backend); TypeScript compiler + Next build (frontend). No frontend unit/E2E tests.

---

## Phase 3 — Feature-to-Code Mapping

Status legend: **Implemented** = works end to end locally; **Partial** = user-facing and substantially built but degraded by missing providers/deps or split contracts; **Scaffold/Hidden** = present in code but disabled and hidden from users; **Missing** = specified but not built.

| # | Feature | Status | Primary location | Notes |
|---|---|---|---|---|
| 1 | App Shell & Navigation | Implemented | `components/layout/*`, `layout.tsx` | Sidebar/topbar/index ticker; hides disabled features via registry |
| 2 | Feature Registry | Implemented | `services/feature_registry.py`, `endpoints/system.py` | 14 features w/ enabled/disabled/degraded/unavailable states + typed 503 |
| 3 | Portfolio Core | Implemented | `services/portfolio_service.py`, `endpoints/portfolio.py` | Canonical bundle; owns totals/weights/sectors/concentration. **Not tenant-safe** (global active) |
| 4 | Upload & Import | Implemented (durability caveat) | `endpoints/upload.py`, `upload_parse/confirm/v2_service.py`, `post_upload_workflow.py`, ingestion | Parse→confirm→background enrich→status-poll all work. Legacy + V2 paths coexist; background jobs non-durable |
| 5 | Portfolio Management & Refresh | Implemented | `endpoints/portfolios_mgmt.py`, `services/portfolio_manager.py` | List/activate/rename/delete/refresh + pre/post snapshots. No user scoping |
| 6 | Dashboard | Implemented | `app/dashboard/page.tsx`, `PortfolioContext` | KPIs, allocation, concentration, action center; isolates optional-panel failures |
| 7 | Holdings | Implemented | `app/holdings/page.tsx`, `components/modules/HoldingsTable.tsx` | Per-row price status chips (live/uploaded/fallback/missing) |
| 8 | Sector Allocation | Implemented | `app/sectors/page.tsx`, charts | Unknown sectors marked explicitly |
| 9 | Fundamentals & Valuation | Partial | `services/fundamentals_view_service.py`, `endpoints/analytics.py` | Works but coverage gaps under provider failure; frontend thresholds can drift from backend |
| 10 | Peer Comparison | Partial | `endpoints/peers.py`, provider peer maps | Selected ticker is live, but peer *universe* is largely a static curated map. Not a distinct registry feature |
| 11 | Risk & Quant Analytics | Implemented (provider-sensitive) | `analytics/*`, `endpoints/quant.py` | Full metric set; quality collapses if yfinance history is unavailable |
| 12 | Optimization & Efficient Frontier | **Partial — degraded** | `optimization/*`, `endpoints/optimization.py` | **scipy/sklearn not installed → Monte-Carlo (12k random weights) + sample covariance fallback**, not SLSQP/Ledoit-Wolf |
| 13 | Simulation / Rebalancing | Implemented (client-only) | `lib/simulation.ts`, `hooks/useSimulation.ts`, `app/simulate/page.tsx` | Frontend sandbox off real holdings; not persisted |
| 14 | History, Changes, Snapshots | Implemented | `endpoints/history.py` + `snapshots.py`, `snapshot_service.py`, `history_service.py` | Canonical + legacy status endpoints coexist; snapshots don't persist full risk metrics |
| 15 | Market Overview | Partial | `endpoints/market.py`, `live.py` | Real indices/movers; some non-equity cards are labeled beta placeholders |
| 16 | News & Corporate Events | Partial | `endpoints/news.py` | NewsAPI optional; empty state can read like "no news"; events often absent |
| 17 | Watchlist | Implemented (global) | `endpoints/watchlist.py`, `models` Watchlist | CRUD + live quotes. **Single global watchlist** (unique ticker). 3 uncommitted edits here |
| 18 | AI Advisor & NL Q&A | **Partial — rule-based only** | `services/ai_advisor_service.py`, `services/ai/provider.py`, `context_builder.py` | **LLM SDKs not installed → always rule-based fallback.** Context builder is real |
| 19 | Action Center & Recommendations | Implemented | `components/action/*`, `lib/insights.ts` | Rule-based; evidence/confidence surfaced. Logic split frontend/backend |
| 20 | Broker Sync | Scaffold/Hidden | `endpoints/brokers.py`, `connectors/*` | Disabled by flag; `/brokers` route returns `notFound()`. Connectors not implemented |
| 21 | Stock Screener | Scaffold/Hidden | `app/screener/page.tsx` | `notFound()`; no backend query engine exists |
| 22 | Diagnostics | Implemented | `endpoints/system.py`, `app/debug/page.tsx` | Strong; should be auth-gated in production |
| — | Standalone AI Chat | Scaffold/Hidden | `endpoints/ai_chat.py`, `app/ai-chat/page.tsx` | Disabled; route returns `notFound()` |
| — | Legacy Frontier | Deprecated/Hidden | `endpoints/frontier.py`, `app/frontier/page.tsx` | Redirects to `/optimize` |

**Coverage summary:** Of the 22 specified features, **~11 are fully implemented**, **~7 are partial** (degraded providers/deps or split contracts), and **~4 are intentionally scaffolded and hidden**. No specified feature is entirely absent from the codebase — the shortfalls are in depth and production-readiness, not breadth.

---

## Phase 4 — Software Engineering Assessment

### Code quality & organization — **Good**

Clear layered architecture (routers → services → repositories → models), pure and independently testable analytics/optimization modules, and a genuine modular-monolith discipline documented in `backend-module-contracts.md`. The **feature registry** is a standout: it lets optional features degrade or disconnect without taking down the app shell. Naming is consistent and comments are purposeful. Weak spots: some frontend pages hold derived business logic (classifications, thresholds) alongside rendering, and advisor/insight logic is duplicated across `frontend/src/lib/*` and backend services — a real drift risk.

### Error handling & validation — **Good, and honest**

This is the project's strongest theme. The system distinguishes `empty / importing / enriching / ready / partial / stale / disabled / unavailable / error` states and surfaces them rather than faking data. Verified example: `price_enrichment_service.valuation_price_and_fallback()` returns an explicit `used_fallback` boolean and a canonical `fallback_average_cost` status when a live price is missing. Parse failures are side-effect-free; refresh failures preserve prior state. **Residual risk:** the cost-basis fallback means portfolio *totals* can look complete even when live prices failed, unless the user notices per-row degraded chips — there's no dashboard-level "N holdings on fallback pricing" banner.

### Security — **Poor (the headline blocker)**

- **No authentication, authorization, or tenancy anywhere.** Grepping the backend app and frontend for `authenticat|jwt|oauth|current_user|login|session` yields zero real auth surface. No table has a `user_id`/owner column.
- **Global mutable state:** one `is_active` portfolio and one unique-ticker watchlist are shared process-wide. In a shared deployment, any user's upload becomes every user's active portfolio.
- Config does show security awareness for a *single-tenant* deploy: `DEBUG=False` default, `DOCS_ENABLED=False` default, CORS allow-list, non-localhost origins required in production. Rate limiting exists only narrowly (`core/dependencies.py`, `live.py`). None of this substitutes for user isolation.

### Performance & scalability — **Adequate locally, not horizontally scalable**

- **In-process caches** (`TimedMemoryCache`, quant/history status stores) are part of correctness, so they won't be shared across multiple workers/processes.
- **Background enrichment uses FastAPI `BackgroundTasks`** — fine locally, but non-durable: a crash between the fast upload response and enrichment completion can leave holdings stuck pending (there is in-function crash recovery, but no job queue).
- **yfinance is a single dominant dependency** for prices, fundamentals, history, market, peers, quant, and optimization — one provider outage degrades most of the app at once.
- SQLite default serializes writes; acceptable for one user, not for concurrent multi-user load.

### Test coverage — **Backend solid, frontend absent**

- **Backend: 64 contract tests, all passing (verified, 3.52s).** They cover portfolio contracts, upload parse/confirm/status, quant/market/peers/news contracts, feature registry, history, advisor boundaries, and the read boundary — meaningful behavior, not just smoke.
- **Frontend: zero unit/component/E2E tests.** Confidence comes only from `tsc --noEmit` (passes) and `next build` (passes, 24 routes). This is the biggest test gap.

### Documentation — **Above average, with drift**

Extensive: a 1,600-line functional spec, an architecture audit, module contracts, smoke checklists, and four dated audit packages. The cost is drift — the README still advertises PyPortfolioOpt optimization and a live AI advisor that the installed environment cannot deliver, and some in-code comments describe superseded upload behavior.

### Dependencies & version management — **A real correctness issue, not just hygiene**

Verified against the 192-package venv: **`scipy`, `sklearn`, `anthropic`, `openai`, and `pypfopt` are all absent**, and in `pyproject.toml` PyPortfolioOpt/scipy/anthropic are commented out. The code soft-imports them and degrades silently:

- `optimization/frontier.py` → Monte-Carlo Dirichlet sampling instead of SLSQP.
- `optimization/covariance.py` → sample covariance instead of Ledoit-Wolf/OAS shrinkage.
- `services/ai/provider.py` → LLM calls can never succeed; advisor is always rule-based.

The degradation is *engineered* (graceful, logged) — which is good defensive design — but the declared dependency manifest doesn't match the advertised capability, so a fresh `poetry install` reproduces the degraded state by default. This should be resolved explicitly in either direction.

---

## Phase 5 — Web Application Readiness

**Framing correction:** the audit brief asks what's needed to "convert this to a web application." P-Insight **is already a web application** — a Next.js SPA frontend over a FastAPI JSON backend. There is no CLI/desktop conversion to do. The real question is **what's missing to go from a single-user local app to a safe multi-user public deployment.**

### Current architecture

Client-rendered Next.js App Router frontend ↔ FastAPI backend ↔ SQLite. No SSR data loading, no Next API routes, no middleware in use — effectively an SPA that happens to be built with Next. Deployment would be: static/Node frontend + Python API server + a database.

### What must change for public deployment

| Area | Current state | Needed for public web deploy |
|---|---|---|
| **Auth/identity** | None | User model, login (email/OAuth), sessions/JWT, route guards |
| **Tenancy** | Global active portfolio + global watchlist | `user_id` ownership on all tables; scope every query to the authenticated user; remove global `is_active` semantics |
| **Database** | SQLite + `create_all`/ad-hoc ALTER | PostgreSQL + Alembic migrations |
| **Background jobs** | FastAPI `BackgroundTasks` (non-durable) | Durable job table or task queue (retry/resume/terminal-failure) |
| **External data** | yfinance single point of failure, in-proc cache | Shared cache (Redis), retry/backoff, provider-health fallback |
| **Secrets** | `.env` file, keys optional | Managed secrets store; required-key validation per enabled feature |
| **Optional capabilities** | scipy/LLM deps uninstalled | Install + declare deps, or gate/relabel the features honestly |
| **Diagnostics** | `/debug` publicly reachable | Auth/admin-gate or disable in production |
| **Deployment infra** | No Dockerfile/compose/CI found | Containerization, CI pipeline, hosting, HTTPS, backups |
| **Frontend tests** | None | Unit + E2E (upload → dashboard → refresh flows, degraded-provider states) |

### Conversion (hardening) roadmap, prioritized

1. **Foundations (highest priority):** auth + tenancy + ownership columns + route guards; Alembic + PostgreSQL. Nothing public is safe until this lands.
2. **Reliability:** durable enrichment jobs; provider caching/retry/fallback; dashboard-level data-quality banner.
3. **Honesty/parity:** install & declare (or explicitly gate) scipy/sklearn/LLM deps; reconcile README with actual capabilities.
4. **Operations:** Dockerize, add CI, managed secrets, HTTPS, DB backups, protect `/debug`.
5. **Confidence:** frontend unit + E2E test suite; keep the backend contract suite as a merge gate.

---

## Phase 6 — GitHub Sync Check

*Caveat: the last recorded `git fetch` in this checkout is dated 27 May 2026; no fresh fetch was performed during this audit. The remote-side statements below reflect that snapshot.*

- **Remote:** `https://github.com/dhruvtantia/P-insight-Beta-version.git` (origin, fetch + push).
- **Current branch:** `phase-1-public-surface-cleanup`, at commit `02f4cfd` "Hide scaffolded public product surfaces."
- **Ahead of `origin/main`:** the branch is **1 commit ahead** of `origin/main` (which is at `b398a42` "Codebase Audit file 2026-05-27"). That commit `02f4cfd` disables and hides the scaffolded public surfaces (ai-chat, brokers, screener, frontier) — verified in the build output where those routes compile to 141 B `notFound()` stubs.
- **Local uncommitted changes (working tree):**
  - Modified: `frontend/src/app/watchlist/page.tsx`, `frontend/src/components/watchlist/WatchlistTable.tsx`, `frontend/src/hooks/useWatchlistPrices.ts` (watchlist live-quote work in progress; ~309 insertions).
  - Deleted (staged in tree): the entire `older version docs/` directory (~24 files).
  - Untracked: `docs/codebase-audit-2026-06-27.md` and now this `AUDIT_REPORT.md`.
- **Other branches present:** `main`, `backend-module-isolation`, `feat/live-mode-transparency-and-quant-debug`, `rebuild/modular-mvp` — all tracking origin as of the 27 May fetch.
- **Discrepancies to resolve:** the watchlist changes are uncommitted (present across at least the last two audits — they've been dirty a while); the `older version docs/` deletion is unstaged and should be confirmed as intentional before committing. **Recommendation:** run a fresh `git fetch` to confirm the remote hasn't advanced, then either commit or stash the watchlist work so the tree is clean before any deployment branch is cut.

---

## Phase 7 — Final Summary & Recommendations

### Overall web-deployment readiness: **4.5 / 10**

A coherent, tested, honestly-degrading **single-user** analytics app — blocked from public deployment by the absence of auth/tenancy, migrations, and a dependency/capability mismatch.

### Top 3 critical gaps (vision ↔ implementation)

1. **No authentication or tenancy** — the product is designed for many users but architected for one (global portfolio + global watchlist, no ownership columns).
2. **AI advisor is rule-based, not LLM-driven** — `anthropic`/`openai` uninstalled and commented out; the provider layer can never load an LLM.
3. **Optimizer is Monte-Carlo, not SLSQP** — `scipy`/`sklearn`/`PyPortfolioOpt` uninstalled; the "efficient frontier" is 12,000 random weight samples with sample covariance.

### Top 5 priorities before web launch

1. Authentication + authorization + tenancy (user model, ownership columns on all 8 tables, route guards, per-user query scoping).
2. Alembic migrations + PostgreSQL as the production database.
3. Reconcile dependencies with advertised capability (install & declare, or gate & relabel scipy/sklearn/LLM features).
4. Harden the external-data layer (shared cache, retry/backoff, provider-health fallback) and add a dashboard-level data-quality/fallback banner.
5. Durable background enrichment + a frontend/E2E test suite.

### Estimated effort to production-ready

**~8–14 focused engineer-weeks** for a genuine multi-user MVP (auth/tenancy/migrations ~3–4w; provider hardening + durable jobs ~2–3w; dependency/deployment/secrets ~2w; frontend + E2E tests + QA ~2–3w), holding feature scope constant.

### Recommended next steps

1. **Do a fresh `git fetch`, then clean the working tree** — commit or stash the watchlist edits and confirm the `older version docs/` deletion. Get to a known baseline before building on it.
2. **Cut a deliberate `auth-and-tenancy` branch and treat it as the gate** for everything public — it's the load-bearing change; sequence the rest behind it.
3. **Make the capability/dependency decision explicit now.** Either budget for installing and declaring scipy/sklearn/LLM SDKs (and update the README), or change the UI copy so the advisor and optimizer are labeled for what they actually do today. Shipping the current mismatch to real users is the fastest way to lose their trust.
4. **Keep the backend contract suite as a required CI check** and extend it as auth/tenancy lands; add the first frontend E2E test around the upload→dashboard happy path.
5. **Protect or disable `/debug`** before any public exposure.

---

*This report was produced by reading every Markdown doc in `docs/` and the root `README.md` (no PDFs exist in the repository), independently verifying prior-audit claims against the current code, and running the backend test suite (64 passed), `tsc --noEmit` (pass), and `next build` (24 routes) live. Remote-git statements rely on a 27 May 2026 fetch and should be re-confirmed with a fresh fetch.*
