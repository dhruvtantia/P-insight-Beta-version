# P-Insight — Module Contract Blueprint

**Status:** Living document. Last revised April 2026.
**Audience:** Engineers working on P-Insight, including future Claude/AI agents asked to make changes.
**Purpose:** Define every major module as an isolated subsystem with a stated *contract* — its inputs, outputs, dependencies, failure modes, and rebuild priority. The goal is that any module can be rebuilt or replaced without destabilising the rest of the app, *provided the contract holds*.

> **Read this first.** If you are about to change behaviour in any module below, you should be able to update its contract in this file. If you cannot, the change is too implicit and should be reconsidered.

---

## How to read this document

Each module section follows the same structure:

- **Purpose** — one sentence.
- **Why it exists** — what would break / what couldn't be done without it.
- **Primary inputs** — what data flows in, from where.
- **Primary outputs** — what data flows out, in what shape, to whom.
- **External dependencies** — third-party APIs, libraries.
- **Persistence touchpoints** — which DB tables it reads/writes.
- **Cache usage** — what is cached, where, with what TTL.
- **Frontend responsibilities** — what the frontend owns for this module.
- **Backend responsibilities** — what the backend owns.
- **Failure modes** — concrete ways this can fail and what the user sees.
- **Current architectural weaknesses** — honest list of what is wrong today.
- **Coupling / dependency issues** — what is bleeding into other modules.
- **Rebuild / refactor priority** — `low` / `medium` / `high` / `critical`.
- **Evolution notes** — how this module should look 6–12 months from now.

A "contract" here is informal but binding: the inputs/outputs and failure semantics are what other modules can rely on. Anything not in the contract is an implementation detail and may change without warning.

---

## The North Star (don't skip this)

P-Insight today mixes three patterns inconsistently:

1. Backend-prepared bundles (e.g. `/portfolio/full`, `/optimization/full`) — *good*.
2. Frontend-driven composition where hooks fetch many endpoints and assemble (e.g. dashboard, advisor) — *acceptable but fragile*.
3. Pure frontend computation on shared state (e.g. `lib/risk.ts`, `lib/simulation.ts`) — *fast but duplicates intelligence the backend should own*.

The direction of travel must be:

- **Backend = intelligence + canonical data.** All metrics, status flags, recommendations, and grouped datasets are computed once on the backend and cached.
- **Frontend = display + interaction.** The frontend should only re-derive things from local user actions (e.g. simulation slider movements). It should not re-implement risk math, weighted-fundamentals math, or advisor heuristics.
- **Each module exposes one or two bundle endpoints.** Stop the N-call composition pattern at page level. The price is one larger response; the gain is contract clarity, cache efficiency, and far fewer integration bugs.
- **Caches are the contract's secret weapon.** A module owns its cache (TTL, invalidation triggers). When a module's cache exists, no caller should ever have to think about latency.

---

## Modules covered

1. [Upload / Ingestion](#1-upload--ingestion)
2. [Portfolio Aggregation](#2-portfolio-aggregation)
3. [Fundamentals](#3-fundamentals)
4. [Risk / Quant](#4-risk--quant)
5. [History / Changes](#5-history--changes)
6. [Peers](#6-peers)
7. [Market Data](#7-market-data)
8. [Watchlist](#8-watchlist)
9. [News](#9-news)
10. [Advisor](#10-advisor)

---

## 1. Upload / Ingestion

### Purpose
Take a user's CSV/Excel of equity holdings, parse it, validate it, persist a clean canonical portfolio to SQLite, and asynchronously enrich each holding with sector/name/fundamentals.

### Why it exists
Without ingestion there is no portfolio. This is the only entry point for the "uploaded" data mode and therefore for ~100% of MVP users.

### Primary inputs
- `multipart/form-data` upload of a `.csv` / `.xls` / `.xlsx` file.
- For V2: a `column_mapping` JSON that maps canonical fields (`ticker`, `name`, `quantity`, `average_cost`, `current_price`, `sector`, `purchase_date`) to the user's actual column names.

### Primary outputs
- **`POST /upload/parse` →** detected column mapping, preview rows (first ~6), confidence flag, row count, list of optional columns missing.
- **`POST /upload/confirm` →** counts of accepted / warning / rejected rows, `portfolio_id`, enrichment job kicked off.
- **`GET /upload/status` →** per-holding enrichment status (sector_status, name_status, fundamentals_status, enrichment_status).
- **Side effect:** writes one `Portfolio` row + N `Holding` rows; updates `FileDataProvider._uploaded_holdings` in-memory cache; pre-warms quant/optimizer caches.

### External dependencies
- `pandas` / `openpyxl` for parsing.
- `yfinance` for sector + fundamentals enrichment.
- Optional: FMP API for fallback sector/fundamentals.
- Internal: static sector map (~150 NSE tickers hardcoded in `sector_enrichment.py`).

### Persistence touchpoints
- **Writes:** `portfolios`, `holdings`, `holdings.enrichment_*` columns, `holdings.last_enriched_at`.
- **Reads:** existing portfolios (to deactivate before activating new one — though "active flag" handling is implicit).

### Cache usage
- **In-memory:** `FileDataProvider._uploaded_holdings` is the live source for the "uploaded" data mode after the request ends.
- **Warm-up effect:** triggers `QuantAnalyticsService.pre_warm_cache()` and `OptimizerService.pre_warm_cache()` as background tasks.
- **Indirect:** populates the shared `_FUND_CACHE` (30 min TTL) when enrichment fetches fundamentals.

### Frontend responsibilities
- Two-step UI: file pick → preview/mapping → confirm.
- Polling `GET /upload/status` to surface enrichment progress.
- Surfacing rejected rows so the user can fix the file and retry.

### Backend responsibilities
- Canonical column detection.
- Row classification (accepted / warning / rejected).
- DB persistence in a single transaction.
- Background enrichment with bounded per-ticker timeouts (5s in `sector_enrichment.py`).
- Warming downstream caches.
- Restoring the last-uploaded portfolio into memory on backend restart (`_restore_uploaded_portfolio()` in `init_db.py`).

### Failure modes
| Failure | What user sees today | Honest assessment |
|---|---|---|
| File format unsupported | HTTP 400 with message | OK |
| Required column missing (ticker / qty / cost) | Row goes to "rejected" bucket | OK |
| yfinance times out per ticker during enrichment | Sector/name marked "unknown"/"ticker_fallback" | OK — degrades gracefully |
| FMP key missing or invalid | Silent fallback to static map / "unknown" | OK but invisible to user |
| App restarts mid-enrichment | In-flight task lost; holdings stuck at `enrichment_status=pending` | **Bug — no resume mechanism** |
| Same file uploaded twice | New portfolio row created each time | Acceptable for now; no de-dup |
| Bare ticker like `TCS` (no `.NS`) | Resolved to `TCS.NS` then `.BO` then bare via `_resolve_ticker_variants()` | OK — works for India |
| User uploads non-Indian tickers (US, EU) | yfinance still tries; sector lookup likely fails | Out of MVP scope, fail silently |

### Current architectural weaknesses
- **No persistence of enrichment job state.** A restart during background enrichment leaves rows orphaned at `pending`. There is no scheduler to retry. If a user uploads and immediately closes the laptop, half the portfolio may stay un-enriched.
- **Active-portfolio semantics are implicit.** `is_active` boolean exists on `Portfolio` but no API mutates it cleanly. `LiveAPIProvider` reads `is_active=True` but the upload flow's effect on this is not documented or enforced.
- **In-memory cache is the source of truth for `mode=uploaded`.** This means the SQLite DB and the `_uploaded_holdings` global can drift if anything except the upload pipeline mutates either side.
- **Static sector map is a data file pretending to be code.** ~150 hardcoded NSE tickers in `sector_enrichment.py` will rot. It belongs in a JSON/SQLite fixture with a refresh mechanism.
- **No deduplication.** Re-uploading the same file creates a new portfolio row, doubling DB clutter without warning.
- **No file size limit visible at the API layer.** A 50MB Excel sheet could OOM the parser.

### Coupling / dependency issues
- Upload pipeline directly mutates `FileDataProvider._uploaded_holdings`. This means refactoring `FileDataProvider` requires changes in `upload_v2_service.py`. They should communicate through a published interface (e.g. an event or a `set_active_portfolio(id)` method on the provider).
- Upload pipeline directly invokes `pre_warm_cache()` on two analytics services. This is *correct behaviour* but bad packaging — upload should publish "portfolio_changed" and the warmers should subscribe.

### Rebuild / refactor priority
**HIGH.** This is the entry point. If it's brittle, everything downstream is suspect. The bugs are well-known and the surface area is small enough to fix in a focused 1–2 week pass.

### Evolution notes
- Treat upload as an **event source**: emits `portfolio.created`, `holding.enriched(ticker)`, `enrichment.completed(portfolio_id)`. Other modules subscribe.
- Move enrichment job state to a small `enrichment_jobs` table with status and last attempt timestamp; build a 2-line resume-on-startup loop.
- Move the static sector map to a JSON fixture with a `last_updated` field and a "refresh from FMP" admin action.
- Consider a "validate without persist" mode for the parse step that returns the same shape `confirm` would, so the frontend can render an exact preview of the final portfolio before commit.

---

## 2. Portfolio Aggregation

### Purpose
Take the active portfolio's holdings and prices and compute the canonical "portfolio bundle": enriched holdings (with `market_value`, `pnl`, `pnl_pct`, `weight`), summary KPIs, and sector allocation.

### Why it exists
Almost every page (`/dashboard`, `/holdings`, `/risk`, `/fundamentals`, `/simulate`, `/advisor`, `/changes`) needs the same enriched portfolio view. Without a canonical aggregation, every page would re-implement the math.

### Primary inputs
- `mode` query param (`uploaded` | `live` | `broker`) — selects which `BaseDataProvider` to use.
- The provider returns raw holdings (ticker, qty, avg cost, current price).

### Primary outputs
- `GET /api/v1/portfolio/full?mode=...` → `{ holdings[], summary, sectors[] }`.
  - Each holding has `market_value`, `pnl`, `pnl_pct`, `weight` *pre-computed*.
  - `summary` = `{ total_value, total_cost, total_pnl, pnl_pct, num_holdings, top_sector }`.
  - `sectors[]` = `[{ sector, value, weight_pct, count }]`.
- Legacy bundle endpoints (`/portfolio/`, `/portfolio/summary`, `/portfolio/sectors`) still exist for backwards compat.

### External dependencies
- Inherits from whatever provider is active (`yfinance` for `live`, `_uploaded_holdings` cache for `uploaded`).

### Persistence touchpoints
- **Reads** `portfolios` and `holdings` (only for `mode=uploaded` indirectly via `_restore_uploaded_portfolio`, and for `mode=live` directly to find `is_active=True`).
- **Writes** none.

### Cache usage
- No explicit cache at this layer. Inherits price/fundamentals caches from `LiveAPIProvider` (60s prices, 30 min fundamentals).
- **This is a gap.** Bundle is recomputed on every request even if neither holdings nor prices have changed.

### Frontend responsibilities
- `usePortfolio()` calls `/portfolio/full` and exposes `{ holdings, summary, sectors, insights, loading, error, refetch }`.
- Pages then *display* the result. Risk computation (`computeRiskSnapshot`) is derived locally from holdings + sectors (see Risk section below — this should move backend).

### Backend responsibilities
- Resolve provider from `mode`.
- Pre-compute per-holding fields in a single pass.
- Compute summary in a second pass.
- Compute sector aggregation in the same second pass.
- Return everything in one response.

### Failure modes
| Failure | What user sees | Honest assessment |
|---|---|---|
| Provider returns 0 holdings | Empty dashboard with "no portfolio" CTA | OK |
| yfinance partial failure (some prices missing) | Holdings have `data_source=db_only` or `unavailable` | OK and visible |
| Provider raises | HTTP 5xx; dashboard shows generic error | OK; could be more graceful |
| Sector field missing for some holdings | They go into "Unknown" sector | OK |
| Currency mismatch (a USD ticker in INR portfolio) | Math is wrong silently | **Out of scope** but worth noting |

### Current architectural weaknesses
- **No backend-side caching of the bundle.** `/portfolio/full` is the most-hit endpoint (every page mount calls it via `usePortfolio`). It should have a 30s–60s in-memory cache keyed on `(active_portfolio_id, mode)`.
- **Frontend re-fetches it per page.** No SWR, no shared context. Navigating dashboard → holdings → risk fires the same request three times.
- **The bundle does not include `riskSnapshot`.** Every consumer recomputes it on the frontend (`lib/risk.ts`). This is fine for now but means risk thresholds live in TS, not Python — a real intelligence boundary is wrong.
- **The endpoint quietly trusts `provider.get_holdings()` to set `current_price`.** If a provider returns holdings without price set, downstream math silently produces zeros.

### Coupling / dependency issues
- Provider contract is informal — `BaseDataProvider.get_holdings()` returns `HoldingBase`, but providers attach extra fields (`data_source`, `enrichment_status`) inconsistently. The schema should explicitly model both required and optional fields.
- Backwards-compat endpoints (`/portfolio/`, `/portfolio/summary`, `/portfolio/sectors`) are still routed but are dead weight if all frontend callers use `/portfolio/full`. Confirm and remove.

### Rebuild / refactor priority
**MEDIUM-HIGH.** It's mostly working, but it is the central bottleneck for frontend perceived performance and for backend computation reuse. Adding a cache and shipping `risk_snapshot` and `weighted_fundamentals` from the same endpoint would eliminate ~30% of the frontend's complexity.

### Evolution notes
- Promote `/portfolio/full` to a true "portfolio context" endpoint that returns: `holdings`, `summary`, `sectors`, `risk_snapshot`, `weighted_fundamentals`, `insights`, `data_quality_report`.
- Cache the bundle for 30s in process and invalidate on `portfolio.changed` / `mode.changed`.
- Move `usePortfolio` from per-page to a single React Context provider mounted at AppShell. Pages subscribe.
- Define `HoldingFull` and `HoldingRaw` as separate Pydantic models so the contract between provider and aggregator is explicit.

---

## 3. Fundamentals

### Purpose
Per-holding fundamental ratios (PE, PB, EV/EBITDA, ROE, margins, dividend yield, market cap) and weighted portfolio-level aggregates.

### Why it exists
Valuation is the second-most asked question after "what's my P&L?". Drives `/fundamentals`, `/peers`, advisor valuation analyzer, simulation fundamentals comparison.

### Primary inputs
- Active portfolio holdings (or any list of tickers).
- `mode` query param.

### Primary outputs
- `GET /api/v1/analytics/ratios?mode=...` → `{ holdings: FinancialRatio[], weighted: WeightedFundamentals, meta: FundamentalsMeta }`.
- `meta` carries source labels and per-field coverage counts (so the UI can say "weighted PE is based on 17 of 22 holdings").

### External dependencies
- `yfinance` (primary).
- FMP API (fallback) when `FINANCIAL_MODELING_PREP_API_KEY` is set.

### Persistence touchpoints
- None directly. Could be persisted to `holdings` table for historical comparison but is not today.

### Cache usage
- `LiveAPIProvider._FUND_CACHE` — 30 min TTL, in-process, per-ticker.
- Was 4h, dropped to 30 min because PE depends on price.

### Frontend responsibilities
- `useFundamentals(holdings)` calls the endpoint, merges per-ticker ratios into holdings via `lib/fundamentals.ts → mergeWithFundamentals()`.
- Display traffic-light colour coding via `peStatus()`, `pbStatus()`, `roeStatus()` etc. *(These thresholds should be backend-owned.)*
- `lib/fundamentals.ts → computeWeightedMetrics()` still exists for the simulation engine but is no longer called by the dashboard / fundamentals page.

### Backend responsibilities
- Per-ticker fetch (yfinance → FMP fallback).
- Weighted aggregate (re-normalising weights among non-null contributors so missing data doesn't bias the average).
- Source labelling (`yfinance` / `fmp` / `unavailable`).

### Failure modes
| Failure | What user sees |
|---|---|
| yfinance times out for one ticker | That row's ratios are null; UI shows "—"; weighted metric excludes it |
| **yfinance times out for one ticker AND no per-ticker timeout guard** | Whole `/analytics/ratios` request can block 20+ s — known issue (status doc §6) |
| FMP key absent | Silent fallback to "unavailable" |
| Bank stock with no EV/EBITDA | Field is null per holding; weighted aggregate excludes it; coverage count drops |

### Current architectural weaknesses
- **No per-ticker timeout in the ratios endpoint.** This is a known production bug; the same `concurrent.futures.ThreadPoolExecutor` + `result(timeout=5)` pattern used in `sector_enrichment.py` should be applied here. Status doc §7.1.
- **Threshold logic lives in frontend TS.** "PE > 30 = expensive" is encoded in `frontend/src/lib/fundamentals.ts`. If a portfolio manager wants to tune thresholds, they edit the UI bundle, not config. Wrong place.
- **Weighted-metric algorithm is duplicated.** Backend `_compute_weighted_metrics()` and frontend `computeWeightedMetrics()` (still used by simulation) implement the same logic. They are *currently* in sync; nothing enforces that.
- **No persistence.** Each request hits yfinance fresh once cache expires. No history of how a stock's PE has moved.
- **No sector-aware weighting.** Aggregating PE across banks + IT + FMCG is mathematically dubious (different distributions). Frontend shows weighted PE as a single number; advisor cites it. This is misleading.

### Coupling / dependency issues
- Coupled with portfolio aggregation through holdings + weights. Backend now sends weighted via `/analytics/ratios.weighted` but frontend still has the helper for simulation. Two algorithms = two truths. Move both behind one backend endpoint that accepts `holdings_override` for simulation.

### Rebuild / refactor priority
**MEDIUM.** Apply the timeout guard immediately (status doc §7.1). The threshold-relocation and dedup work is more invasive — schedule for the rebuild phase.

### Evolution notes
- Backend should expose a `compute_fundamentals_view(holdings: list[Holding]) -> FundamentalsView` service that the upload pipeline, ratios endpoint, simulation endpoint, and advisor all share.
- Move thresholds (`PE_CHEAP`, `PE_EXPENSIVE`, `PB_HIGH`, etc.) to a YAML/JSON config readable from both backend and bundled into the API response so frontend can stop hardcoding.
- Optionally persist fundamentals snapshots daily so we can show "PE is at the 80th percentile of its 1-year range".
- Ship sector-aware weighted views: `weighted_overall`, `weighted_by_sector[]`. Stop showing one number that hides three different distributions.

---

## 4. Risk / Quant

### Purpose
Two distinct things bundled here:
1. **Risk snapshot** (HHI, effective N, top-3 weight, max position, diversification score, risk profile classification, sector concentration).
2. **Quant analytics** (volatility, Sharpe, Sortino, max drawdown, beta vs Nifty 50, correlation matrix, per-holding contribution, performance time series).

### Why it exists
Concentration is the most common silent risk. Quant metrics give institutional-quality lenses to the user.

### Primary inputs
- Risk snapshot: holdings + sectors (already available from portfolio aggregation).
- Quant: holdings + ~1y of daily price history per ticker + benchmark series (Nifty 50).

### Primary outputs
- Risk snapshot (today): computed in `frontend/src/lib/risk.ts` from already-fetched holdings.
- Quant: `GET /api/v1/quant/full?mode=...&period=1y` → `{ metrics, performance[], drawdown[], correlation[][], contributions[], meta }`.

### External dependencies
- yfinance for price history (one yf.download call per ticker, parallelised via `asyncio.gather`).
- yfinance for benchmark history (1h cached).

### Persistence touchpoints
- None. Pure in-memory computation.

### Cache usage
- `_QUANT_CACHE`: 24h for mock (defunct), 10 min for live, in-process.
- `_PRICE_CACHE`: 60s, in-process.
- `_BENCHMARK_CACHE`: 1h, in-process.
- All three are lost on backend restart.

### Frontend responsibilities
- **Risk snapshot:** `lib/risk.ts → computeRiskSnapshot(holdings, sectors, summary)` — computes HHI, effective N, profile classification (highly_concentrated → conservative), top holdings, flags.
- **Quant:** `useQuantAnalytics()` calls `/quant/full`. Renders performance + drawdown + correlation heatmap + contributions.

### Backend responsibilities
- `QuantAnalyticsService.compute_all(period)`:
  - parallel price fetch
  - price matrix alignment (forward fill, drop all-NaN rows)
  - portfolio return series (weighted)
  - benchmark fetch (graceful when unavailable)
  - risk metrics via `analytics/risk.py`
  - drawdown, correlation, per-holding contribution
  - cache populate, return.
- `pre_warm_cache()` triggered by upload background task.

### Failure modes
| Failure | What user sees |
|---|---|
| Price history fetch fails for some tickers | They are excluded from quant; listed in `meta.invalid_tickers` |
| Benchmark fetch fails | Portfolio-only metrics still compute; beta/alpha/IR are null; `meta.benchmark_available=False` |
| Cold cache + 20-stock portfolio | 5–20s blocking call on `/quant/full` (status doc §6) |
| App restart wipes `_QUANT_CACHE` | Next risk page visit triggers cold load |
| Portfolio < 5 holdings | Risk metrics still compute but covariance optimisations may degrade |

### Current architectural weaknesses
- **Risk snapshot lives in TypeScript.** This is the single biggest "frontend-owned intelligence" violation in the codebase. Risk thresholds (single_stock_flag = ≥30%, sector_concentration_flag = ≥50%, profile bands) are defined in `lib/risk.ts` and have no backend equivalent. Move them.
- **Quant cache is in-process.** With multiple workers in production, each worker has its own cache. With one worker, restart wipes it. A 5–20s cold load on the user's most-visited analytics page is unacceptable for beta.
- **`/quant/full` is a heavy single endpoint.** It bundles 5+ concerns (returns, vol, drawdown, correlation, contributions). When one part fails (e.g. benchmark), the whole response is partial. Splitting per-concern endpoints with a fast metadata endpoint would let frontend render partial UI immediately.
- **No persistence of historical metrics.** Sharpe ratio "last week vs today" is impossible because nothing is stored.
- **PyPortfolioOpt is in the same broad area** (`/optimize`, `/simulate`) but lives in a separate module (`app/optimization/`). The boundary between "quant" and "optimization" is unclear — both use the same price matrix and could share a fetch layer.

### Coupling / dependency issues
- `pre_warm_cache()` is called by upload service. Inversion would be cleaner: warmer subscribes to "portfolio_changed".
- Frontend `useAdvisor` calls `computeRiskSnapshot()` and so does the dashboard, the risk page, and `PortfolioAdvisorPanel`. This is technically fine (pure function) but means a breaking change to risk logic ripples into 5+ files.

### Rebuild / refactor priority
**HIGH.** The cold-load latency is a UX killer for beta. The risk-snapshot-in-TS is the single biggest barrier to making the advisor and the simulator share the same intelligence as the dashboard.

### Evolution notes
- Move `riskSnapshot` to backend as `RiskSnapshotService.compute(holdings, sectors)` — pure, no I/O. Ship it inside `/portfolio/full` so every consumer gets it for free.
- Persist quant cache to Redis (or the SQLite DB as a fallback); keep TTLs.
- Split `/quant/full` into `/quant/metrics` (fast, no price history needed if cached), `/quant/performance` (price history), `/quant/correlation`. Bundle endpoint can compose them.
- Persist daily metrics snapshots (Sharpe today, vol today) so trends become possible.

---

## 5. History / Changes

### Purpose
Track portfolio over time via *snapshots* (frozen point-in-time copies of holdings + summary). Compute deltas between snapshots. Power `/changes` and `usePortfolioHistory`.

### Why it exists
Without snapshots, a portfolio analytics tool is a photograph, not a story. "What changed since last month?" is a core advisor question.

### Primary inputs
- Active portfolio holdings + summary at the moment of snapshot creation.
- A snapshot ID (or two) for delta queries.

### Primary outputs
- `GET /api/v1/snapshots` → list of snapshots with metadata.
- `GET /api/v1/snapshots/{id}` → snapshot detail.
- `GET /api/v1/snapshots/delta?from=...&to=...` → before/after diff.
- `GET /api/v1/history/...` → daily portfolio value series (scaffold; not fully implemented).

### External dependencies
- None directly. Reads from SQLite.

### Persistence touchpoints
- **Reads/writes** `snapshots` (table backed by `app/models/snapshot.py` + `app/models/history.py`).

### Cache usage
- None today. Snapshots are immutable so they're trivially cacheable, but no caching layer exists.

### Frontend responsibilities
- `useSnapshots()`, `useSnapshotHistory()`, `useDelta()` hooks.
- `/changes` page renders before/after view, sector deltas, added/removed tickers.
- Cross-link to `/advisor?q=...` to ask AI about specific changes.

### Backend responsibilities
- Snapshot creation (manual via API, auto-triggered on upload — *unconfirmed; verify*).
- Snapshot listing.
- Delta computation (`computePortfolioDelta` in `frontend/src/lib/delta.ts` *and* potentially backend — duplication risk).

### Failure modes
| Failure | What user sees |
|---|---|
| Zero snapshots | Empty state |
| One snapshot only | Delta-impossible empty state (handled per status doc) |
| Snapshot fetch error | Generic error |
| `history.py` endpoint unfinished | Endpoint registered but returns scaffold response |

### Current architectural weaknesses
- **Delta computation likely duplicated.** `frontend/src/lib/delta.ts` exists and so does `app/services/history_service.py`. Confirm whether both compute the same thing; if so, delete the frontend version.
- **No daily auto-snapshot.** The whole "portfolio history" experience requires snapshots to exist; the UX expectation is daily but creation is manual or triggered by upload.
- **No `history` table for daily portfolio value series.** The `usePortfolioHistory` hook exists but the backing endpoint returns scaffold data.
- **Snapshot diff logic is `O(n)` in holdings count, fine, but no aggregated KPIs are precomputed.** Each `/changes` view recomputes them.
- **Tagging is missing.** A snapshot has no concept of "before rebalance" / "after Q4 earnings". User can't navigate by event.

### Coupling / dependency issues
- Frontend `useSnapshots` and `usePortfolios` both manage portfolio state; it's possible to have an "active portfolio" without any snapshots, but UI assumes both exist.
- `history.py` endpoint is registered in the router but the underlying service is incomplete.

### Rebuild / refactor priority
**MEDIUM.** Postpone heavy work until after beta — most beta users will have <3 snapshots and won't notice. But: implement daily auto-snapshot before beta launch, otherwise the history page is empty for 30 days.

### Evolution notes
- Add a daily cron / scheduled task ("9 PM IST snapshot of active portfolio") — there's already a `schedule` skill available via Cowork; not a code dependency.
- Add `Snapshot.tags` and `Snapshot.note` fields.
- Store *computed* deltas alongside snapshots so `/changes` reads pre-computed data.
- Implement `history.py` properly: daily portfolio value series for charting.
- Move all delta logic to backend; frontend just renders.

---

## 6. Peers

### Purpose
Compare a single holding against industry peers on fundamentals.

### Why it exists
"Is TCS expensive vs Infy and Wipro?" — answers concentration + valuation questions in one move.

### Primary inputs
- A `ticker` string in the URL.
- `mode` query param.

### Primary outputs
- `GET /api/v1/peers/{ticker}?mode=...` → `{ selected: FundamentalsRow, peers: FundamentalsRow[], source, meta }`.

### External dependencies
- yfinance fundamentals (per-peer).
- FMP (peer discovery fallback when ticker not in static map).
- Static peer map (~150 NSE tickers in `live_provider.py`).

### Persistence touchpoints
- None.

### Cache usage
- Inherits `_FUND_CACHE` from `LiveAPIProvider` (30 min, in-process).

### Frontend responsibilities
- `usePeerComparison(ticker)` hook.
- `/peers` page renders comparison table with metric-specific insights ("cheap vs peers", "strong ROE", etc.).

### Backend responsibilities
- Peer lookup (static map → FMP → empty).
- Concurrent fetch of selected + peers (asyncio.gather).
- Source labelling.

### Failure modes
| Failure | What user sees |
|---|---|
| Ticker not in peer map and no FMP key | Empty peer list |
| One peer's yfinance fetch hangs | Whole response can block 15+ s — known issue (status doc §6) |
| Selected ticker fundamentals fail | Whole panel mostly empty |
| Bare ticker (no exchange suffix) | Variant resolution kicks in (`.NS` → `.BO` → bare) |

### Current architectural weaknesses
- **No page-level aggregate timeout.** Same flaw as `/analytics/ratios`; peer fetches can collectively block on a slow yfinance.
- **Static peer map is brittle and small.** Only ~150 tickers. Anything outside the NIFTY 50 / Nifty Next 50 universe gets sparse peers or empty.
- **No "industry membership" data model.** Peers are derived purely from a hardcoded map, not from a sector/industry classification system.
- **No way to override peer set.** User can't say "compare TCS to ACN, IBM, INFY".
- **Insights ("stock is cheap") are computed in frontend** with the same threshold logic as the fundamentals page. Same concern as fundamentals threshold relocation.

### Coupling / dependency issues
- Tight coupling to `LiveAPIProvider._PEER_MAP`. Refactor would touch both peer endpoint and live provider.
- Shares fundamentals fetch logic with analytics ratios endpoint — both should call one shared service.

### Rebuild / refactor priority
**MEDIUM.** Add the page-level timeout (status doc §7.2) immediately. Map expansion is a slow background activity. Custom peer override is a v2 feature.

### Evolution notes
- Replace the static peer map with a small `industry_peers` table seeded from FMP and refreshable.
- Add `peer_override` per-ticker so user can curate.
- Move comparison-insight thresholds to backend config.
- Consider folding the peer endpoint into the fundamentals service so there is one canonical "compute fundamentals for a set of tickers" call.

---

## 7. Market Data

### Purpose
Show market context: 3 main indices (NIFTY 50, SENSEX, BANK NIFTY), 8 sector indices, top 5 gainers + losers from NIFTY 50.

### Why it exists
Landing page hook + ambient context strip in topbar. Lets users orient themselves before looking at their own portfolio.

### Primary inputs
- None (no parameters).

### Primary outputs
- `GET /api/v1/market/overview` → `{ indices[], sectors[], gainers[], losers[], status, meta }`.
- Each index/sector has `status: live | last_close | unavailable`, `bar_date`, `last_updated`.

### External dependencies
- yfinance (per-index `Ticker().history()` + a batched `yf.download()` for gainers/losers).

### Persistence touchpoints
- None.

### Cache usage
- `_OVERVIEW_CACHE`: 2 min TTL, in-process.
- Per-index 8s timeout, batched-download 25s timeout.

### Frontend responsibilities
- `useIndices()` polls every 120s.
- Topbar `IndexTicker` component renders 3 chips with status dot.
- `/market` landing page renders the full overview.

### Backend responsibilities
- Concurrent per-index fetch via `ThreadPoolExecutor`.
- Status labelling (live vs last_close vs unavailable).
- Graceful degradation per section.

### Failure modes
| Failure | What user sees |
|---|---|
| One index times out | That chip shows "unavailable" with WiFi-off icon; others render |
| Market closed (weekend) | Indices show last_close with grey dot; gainers/losers commonly empty (expected) |
| All yfinance calls fail | Strip shows all-grey dots; landing page shows per-section empty states |

### Current architectural weaknesses
- **2-minute cache is low for landing page.** Every fresh visit triggers re-fetch. A 5–10 min cache with a "force refresh" admin action would be saner.
- **Cache lost on restart.** Same global pattern.
- **Sector indices are hardcoded.** Adding a new sector requires code change.
- **Gainers/losers universe is hardcoded NIFTY 50.** No "gainers of my portfolio".
- **No historical daily values stored.** The "1d / 5d / 1m" chart concept on the landing page is impossible without persistence.

### Coupling / dependency issues
- Standalone module. Healthy. Only consumer is `useIndices` + `/market` page.
- `useIndices` was rewritten in April 2026 to use `/market/overview` instead of `/live/indices` (which was buggy). Old `/live/indices` is deprecated but still routed.

### Rebuild / refactor priority
**LOW.** Mostly stable. The only beta-blocker is "what shows when market is closed" — currently handled with status dots and graceful empty states.

### Evolution notes
- Move sector index and gainer/loser universe to config (JSON).
- Persist daily index closes for chart history.
- Add Redis cache.
- Consider a "watch this index" feature so user can pin custom indices.

---

## 8. Watchlist

### Purpose
Track tickers the user is interested in but doesn't (yet) own.

### Why it exists
Bridges discovery (peers, news, market) and action (simulation, eventual buy).

### Primary inputs
- Manual user adds: `ticker`, `name`, `tag`, `sector`, `target_price`, `notes`.

### Primary outputs
- `GET /api/v1/watchlist/` → list of items.
- `POST /api/v1/watchlist/` → add item.
- `PUT /api/v1/watchlist/{id}` → update.
- `DELETE /api/v1/watchlist/{id}` → remove.
- For live mode: also enriched with current prices via `useWatchlistPrices`.

### External dependencies
- yfinance (price enrichment when in live mode).

### Persistence touchpoints
- **Reads/writes** `watchlist` table.

### Cache usage
- Frontend module-level `_itemCache` in `useWatchlist.ts` (survives re-mounts but not page reload).
- Backend: none.

### Frontend responsibilities
- `useWatchlist()` with optimistic add/update/delete + rollback on error.
- `/watchlist` page CRUD UI.
- "Add from portfolio" + "Add from peers" cross-flow integration.

### Backend responsibilities
- CRUD on `watchlist` table.
- Price enrichment when called via live provider.

### Failure modes
| Failure | What user sees |
|---|---|
| DB write fails | Optimistic update rolls back; error toast |
| Live price fetch fails | Item shows price as "—" |
| Duplicate ticker | DB has unique constraint on `ticker`; add fails with 4xx |

### Current architectural weaknesses
- **In-memory frontend cache is unconventional.** `_itemCache` is a module-level mutable global. Works but confuses anyone reading the code. Should be a Zustand store or React Query.
- **Single-user assumption.** No watchlist scoping by user (but P-Insight is single-user by design — acceptable).
- **No alerts/notifications.** "Tell me when XYZ hits target_price" is the obvious next feature; not built.
- **No data quality feedback.** If `ticker` is invalid, the row stays with no price and no error.

### Coupling / dependency issues
- Lightly coupled. Used by `/simulate` ("Add from watchlist") and `/peers` ("Add to watchlist") — but those couplings are clean (function calls, not state sharing).

### Rebuild / refactor priority
**LOW.** Solid as-is for MVP.

### Evolution notes
- Add target-price alerts (would require a scheduled task; the `schedule` skill exists in Cowork).
- Add "rationale" field beyond `notes` (so the AI advisor can use rationale as context).
- Allow tagging-by-thesis.

---

## 9. News

### Purpose
Surface news + events for the user's holdings.

### Why it exists
Context for portfolio movements. Earnings calendar. Catalyst tracking.

### Primary inputs
- Optional ticker filter.
- Optional event_type filter (earnings, dividend, rating, deal).
- Defaults: all holdings, all event types.

### Primary outputs
- `GET /api/v1/news/?tickers=...&event_type=...` → `{ articles[], meta }`.
- `GET /api/v1/news/events?tickers=...` → `{ events[], meta }` (scaffold; live mode returns empty).

### External dependencies
- NewsAPI (`NEWS_API_KEY` env). If absent, response is `news_unavailable=True` with empty list.

### Persistence touchpoints
- None.

### Cache usage
- None today. Each request hits NewsAPI fresh (rate-limit risk).

### Frontend responsibilities
- `useNews()` hook.
- `/news` page renders article cards + event timeline.
- Filter UI by event type and ticker.

### Backend responsibilities
- Build NewsAPI query: `(TCS OR INFY OR ...) earnings`.
- Match results by ticker mention.
- Return source labelling.

### Failure modes
| Failure | What user sees |
|---|---|
| `NEWS_API_KEY` missing | `news_unavailable=True`, empty list, friendly "configure NewsAPI to enable" message |
| Rate-limited | Same as missing key (gracefully empty) |
| All articles empty | Empty state |

### Current architectural weaknesses
- **No caching.** News for `(tickers, event_type)` set should cache 30+ min — articles don't change every second.
- **Events endpoint is a scaffold.** `live` mode returns `[]`. Earnings calendars require a separate data source (FMP earnings calendar, or Investing.com, or a paid data feed). No source is wired up.
- **Match-by-ticker-in-title is fragile.** "TCS Q4 results" matches but "Tata Consultancy Services beats estimates" does not. Need fuzzy company-name matching.
- **No ranking / dedup.** Ten outlets covering the same earnings show as ten cards.
- **No sentiment.** Backend defines a `sentiment` field in the contract but nothing populates it.

### Coupling / dependency issues
- Standalone. Clean.

### Rebuild / refactor priority
**MEDIUM** for caching + dedup, **LOW** for events (postpone to v2).

### Evolution notes
- Add a `news_cache` keyed on `(tickers, event_type, day)` with 30 min TTL.
- Implement company-name fuzzy match for higher recall.
- Wire FMP earnings calendar to populate events.
- Add a sentiment scoring step (rules-based first, LLM later).
- Consider RSS/Atom polling as a free fallback to NewsAPI.

---

## 10. Advisor

### Purpose
Conversational "what should I do?" surface. Combines structured portfolio context, rule-based heuristics, and (optionally) LLM responses.

### Why it exists
P-Insight's positioning is "personal portfolio intelligence". The advisor is the most differentiated surface. Without it, the app is a fancy spreadsheet.

### Primary inputs
- A user `query` string.
- Optional conversation history.
- Server-side context: portfolio holdings, fundamentals, watchlist, snapshots, optionally optimization output.

### Primary outputs
- `POST /api/v1/advisor/ask` → `{ answer_text, items[], follow_ups[], meta: { provider, latency_ms } }`.
- `GET /api/v1/advisor/status` → `{ provider, available: bool }`.
- Local fallback: `lib/advisor.ts → routeQuery(query, engineInput) → AdvisorResponse` (same shape).

### External dependencies
- Anthropic (Claude) or OpenAI, depending on configured provider.
- If neither key is configured: rule-based fallback only.

### Persistence touchpoints
- None today (no conversation log persistence).

### Cache usage
- None.

### Frontend responsibilities
- `useAdvisor()` orchestrates context assembly (calls `usePortfolio`, `useFundamentals`, `useWatchlist`, `useSnapshots`).
- Builds `engineInput`.
- Calls `/advisor/status` on mount.
- Per-query: prefers backend AI; falls back to local `routeQuery` if AI unavailable or errors.
- `/advisor` page renders chat UI + context strip + suggested questions + structured response cards.

### Backend responsibilities
- `app/services/ai_advisor_service.py` + `app/services/context_builder.py`:
  - Pull canonical context (holdings, fundamentals, snapshots, optionally optimization).
  - Build LLM prompt.
  - Call provider (`app/services/ai/provider.py` abstracts Claude vs OpenAI).
  - Return structured `AIAdvisorResponse` shape.

### Failure modes
| Failure | What user sees |
|---|---|
| No LLM key configured | Provider badge shows "Rule-based"; local routing handles query |
| LLM call fails or times out | Frontend silently falls back to local rule-based answer |
| Local rule-based returns nothing | Empty answer with "I'm not sure" message |
| Context builder fails (e.g. portfolio empty) | Advisor says "upload a portfolio first" |

### Current architectural weaknesses
- **Two intelligence engines, one shape.** `lib/advisor.ts` (frontend) and `ai_advisor_service.py` (backend) both produce `AdvisorResponse`. They are *meant* to be interchangeable. They don't actually agree:
  - Backend has full quant context (Sharpe, beta).
  - Frontend rules use only what `engineInput` contains.
  - This means the same query produces different answers depending on whether the AI is configured. **This is a credibility risk** — users will notice.
- **No conversation persistence.** Refresh the page, lose the chat. Critical for an advisor-style product.
- **Context-builder is opaque.** It ships a wide blob to the LLM each call. No cost control, no token budgeting visible.
- **No tool-use / function-calling.** The LLM cannot ask for "more data on TCS" — it gets a fixed context blob and must answer from that.
- **No safety / disclaimer scaffolding.** A user asking "should I buy?" gets a confident answer.
- **Rule-based engine is sprawling** (650+ lines in one TS file). 7 analyzers tightly coupled by a routing function. Hard to test, hard to extend.
- **Risk snapshot is computed twice on `/advisor` page** (once in `useAdvisor`, once in `PortfolioAdvisorPanel`). Minor but worth noting.

### Coupling / dependency issues
- Frontend pulls 4+ hooks worth of state into `engineInput`. If any hook fails, the advisor degrades silently.
- Backend's `context_builder` likely re-fetches some of the same data — verify, then dedupe via shared cache.

### Rebuild / refactor priority
**HIGH.** This is the differentiated feature. The current implementation works as a demo but the "two engines, two answers" issue and missing conversation persistence are visible to any beta user within 30 minutes.

### Evolution notes
- Decide: backend is the source of truth for advisor logic. Deprecate `lib/advisor.ts` entirely; keep only the local rule-based fallback for "LLM unavailable" with a *prominently displayed* "limited mode" badge.
- Persist conversations to a `conversations` table.
- Add tool-use: let the LLM request `get_fundamentals(ticker)`, `get_peers(ticker)`, `simulate_rebalance(weights)`. This is the right architecture.
- Centralise prompts in a versioned `prompts/` directory with eval coverage.
- Wire the advisor into the simulation engine: "what if I increase IT exposure 10%" becomes a server call, not a local-only computation.
- Add a clear disclaimer / "informational only" footer on every advisor message.

---

## Cross-cutting issues (read this before any module rebuild)

### A. The cache layer is a single bullet to the foot
Every cache today is in-process Python dicts (`_PRICE_CACHE`, `_FUND_CACHE`, `_QUANT_CACHE`, `_OPT_CACHE`, `_OVERVIEW_CACHE`, `_BENCHMARK_CACHE`). Restart wipes everything. Multi-worker production wipes everything per worker.

**Symptom in prod:** every Monday morning the user opens the app, hits `/risk`, waits 15 seconds. Bad first impression for beta.

**Fix:** Move to Redis or DB-backed cache before beta launch. Same TTLs. Same access pattern. One line change in each service if you abstract `Cache` once.

### B. Frontend computes intelligence the backend should
Today, `lib/risk.ts`, `lib/fundamentals.ts` (thresholds), `lib/advisor.ts` (rule engine), `lib/insights.ts`, `lib/simulation.ts` (delta + suggestions) all encode business logic in TypeScript.

**Symptom:** any time you tweak a threshold ("max holding warning at 25% instead of 30%"), you ship a frontend bundle. Other consumers (e.g. backend reports, future mobile app) miss the change.

**Fix:** Move all thresholds + risk math + advisor heuristics + insight generation into Python services. Ship results via existing endpoints. Frontend's only computation should be: simulation what-if (purely user input → derived state, with no shared truth).

### C. The "active portfolio" is implicitly tracked
- Backend uses `Portfolio.is_active` boolean.
- Frontend uses `portfolioStore.activePortfolioId` + `usePortfolios` (manually synced).
- Live provider reads `is_active=True` from DB.
- Upload flow likely flips `is_active` but it's not auditable.

**Symptom:** rare bug where two portfolios appear active, or none does, or the frontend and backend disagree.

**Fix:** Single backend endpoint `/portfolios/active` (GET / PUT). Single frontend hook `useActivePortfolio()` that subscribes. Delete `portfolioStore.activePortfolioId`.

### D. Provider contract is informal
`BaseDataProvider` defines abstract methods, but providers attach extra optional fields (`data_source`, `enrichment_status`) inconsistently. Pydantic schemas are loose.

**Symptom:** swapping `LiveDataProvider` for `BrokerProvider` in a future broker integration will surface dozens of "field is None" assumptions.

**Fix:** Strengthen the contract with Pydantic models for both inputs (provider config) and outputs (`HoldingFull`, `FundamentalsRow`, `PriceHistory`). All providers must return *exactly* this shape — no extra fields, no missing required fields.

### E. The same data is fetched multiple times across hooks
Status doc §7.6 already calls this out. `usePortfolio` is mounted on every page; each page mount re-fetches. No SWR.

**Fix:** Lift portfolio context to AppShell level (React Context or single Zustand slice). Fetch once. Pages subscribe.

### F. Tier 3 / scaffold pages are still routed
`/optimize`, `/simulate`, `/brokers`, `/frontier`, `/ai-chat` are technically reachable. They mount expensive hooks (`useOptimization`, `useQuantAnalytics`) on load. A user landing on `/simulate` immediately fires `/optimization/full`.

**Fix:** Either gate behind feature flags + auth (no public route) or convert to manual-trigger UIs ("click Run to compute").

---

## What good looks like (target end-state)

A future Claude/AI agent (or human) reading this should be able to:

1. Pick any module above.
2. Read its contract section.
3. Make a change.
4. Verify only the contract section needed updating (not other modules' sections).
5. Run that module's tests.
6. Ship.

Today, that workflow breaks because:
- Risk logic spans frontend + backend.
- Caches are not module-owned.
- Advisor is two engines.
- Active portfolio state is split.
- The provider contract is informal.

Closing those gaps is what the [refactor-rebuild-blueprint](./refactor-rebuild-blueprint.md) plans.
