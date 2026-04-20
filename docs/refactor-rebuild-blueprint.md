# P-Insight — Refactor & Rebuild Blueprint

**Status:** Ranked plan, April 2026.
**Audience:** The engineer (or AI agent) about to start modifying P-Insight with the goal of stabilising and modularising it before beta launch.

> **Read order:**
> 1. [module-contract-blueprint.md](./module-contract-blueprint.md) — understand each module's contract and current weaknesses.
> 2. [product-requirements-mvp.md](./product-requirements-mvp.md) — understand what must work for beta.
> 3. This document — the practical sequenced plan that connects the two.

---

## 1. Guiding principles

These are the rules you apply when choosing between two fixes. They come before any specific item below.

1. **Contracts before code.** Before changing a module's internals, write down (or update in `module-contract-blueprint.md`) what its inputs/outputs/failure modes are. If you can't write it in ≤20 lines, the module is too broad and should be split.
2. **Backend owns intelligence; frontend displays it.** Every threshold, every classification, every heuristic should live in Python. The frontend should only re-derive from local user actions (simulator sliders).
3. **One canonical endpoint per concern.** Prefer `/portfolio/full` (bundle) over `/portfolio/` + `/portfolio/summary` + `/portfolio/sectors`. When a page needs multiple concerns, add to the bundle; don't multiply endpoints.
4. **Every cache is a named object with a TTL and an invalidation trigger.** No more "we cache this in a module-level dict." If you can't name the cache and its invalidation events, don't cache.
5. **Don't ship dead pages.** If a page isn't in the MVP and isn't being actively developed, either hide it from nav AND routing, or delete it.
6. **Every behaviour change touches a test.** Where tests don't exist for the module you're editing, the first PR is a test file. Reliability before features.
7. **Atomic, reversible PRs.** Each PR in the plan below should be revert-safe. No "big bang" refactors.

---

## 2. Immediate fix areas (this week, before anything else)

These are low-effort, high-impact bugs that are actively breaking UX. Each is ≤1 day of work.

### 2.1 Per-ticker timeout on `/analytics/ratios`
- **Why:** One slow yfinance ticker blocks the whole fundamentals response 20+ seconds. Status doc §7.1.
- **How:** Apply the `concurrent.futures.ThreadPoolExecutor + future.result(timeout=5)` pattern already in `sector_enrichment.py`.
- **Risk:** Low. Fall back to `{}` on per-ticker timeout; frontend already handles null values.
- **Owner:** `backend/app/api/v1/endpoints/analytics.py` or a new helper in `services/`.

### 2.2 Per-peer timeout on `/peers/{ticker}`
- **Why:** Same pattern as §2.1. Status doc §7.2.
- **How:** Same timeout wrapper around the async per-peer fetch.
- **Risk:** Low.

### 2.3 Delete `/ai-chat` and `/sectors` pages
- **Why:** Both are scaffolds/duplicates. They sit in the route tree and inflate the surface area.
- **How:**
  - Frontend: delete `frontend/src/app/ai-chat/` and `frontend/src/app/sectors/`.
  - Backend: either keep `ai_chat.py` router for backwards compat or unregister it in `router.py`.
  - Search for any component imports referencing these paths.
- **Risk:** Low — nav links are already removed.

### 2.4 Remove dead `mock` mode branches
- **Why:** Frontend may still contain `mode === 'mock'` branches after mock was removed from the valid union. Status doc §7.3.
- **How:** `grep -rn "'mock'" frontend/src` — delete dead branches. Compile-check via `tsc`.
- **Risk:** Low.

### 2.5 Hide `/optimize`, `/simulate`, `/frontier`, `/brokers`, `/screener` from nav
- **Why:** Tier 3. These pages mount expensive hooks on load; a user landing on them triggers cold `/quant/full` or `/optimization/full`.
- **How:** Remove from sidebar. Keep routes reachable by URL for dogfooding. If `BROKER_SYNC_ENABLED=false`, broker page is already hidden.
- **Risk:** Low.

### 2.6 Enforce file size limit on upload
- **Why:** No visible cap. A 50MB Excel sheet could OOM the parser. Documented in module contract §1.
- **How:** Add `max_upload_size_mb: int = 10` to settings. Enforce in the endpoint. Return HTTP 413 with a clear message.
- **Risk:** Low.

### 2.7 Disclaimer footer on advisor responses
- **Why:** Legal / brand risk (PRD §10).
- **How:** Add footer component to `AdvisorResponseCard`.
- **Risk:** Zero.

---

## 3. Modules to isolate (before beta)

These are structural changes. Each is 3–7 days. Do in the order listed.

### 3.1 Lift portfolio context to AppShell (single-fetch pattern)
- **Problem:** `usePortfolio` mounts per-page; navigating fires `/portfolio/full` repeatedly.
- **Fix:**
  1. Add a `PortfolioContext` provider mounted at AppShell.
  2. Fetch `/portfolio/full` once per `(mode, active_portfolio_id)`.
  3. Invalidate on: upload confirm, mode toggle, portfolio switch.
  4. Replace `usePortfolio` with a thin `useContext` subscriber.
- **Risk:** Medium. Requires careful invalidation. Add tests for every invalidation trigger.
- **Gain:** 30–40% fewer HTTP calls; faster perceived navigation; sets up cache-busting for other hooks.

### 3.2 Single "active portfolio" source of truth
- **Problem:** `portfolioStore.activePortfolioId` (frontend) and `Portfolio.is_active` (DB) are manually synced.
- **Fix:**
  1. Add `GET /api/v1/portfolios/active` and `PUT /api/v1/portfolios/active`.
  2. Frontend `useActivePortfolio()` fetches and manages via these endpoints.
  3. Delete `portfolioStore.activePortfolioId`.
  4. `usePortfolios` becomes read-only listing.
- **Risk:** Medium. Any latent dependency on `portfolioStore` breaks compilation — easy to find via TS.
- **Gain:** One bug class eliminated.

### 3.3 Move risk-snapshot computation to backend
- **Problem:** `lib/risk.ts → computeRiskSnapshot()` encodes HHI, thresholds, classification in TypeScript. 5+ consumers.
- **Fix:**
  1. Create `app/services/risk_snapshot_service.py::compute_risk_snapshot(holdings, sectors) -> RiskSnapshot`. Pure function.
  2. Include `risk_snapshot` in `/portfolio/full` response.
  3. Frontend consumes directly; `lib/risk.ts` becomes a display-only module (colour mappings can stay, numeric computation goes).
- **Risk:** Medium. Multi-page visual change; need to verify that outputs match existing TS logic exactly.
- **Gain:** Advisor, simulation, risk page, dashboard all share one truth. Threshold tuning becomes a Python change.

### 3.4 Persistent cache layer (Redis)
- **Problem:** All caches are in-process dicts. Restart wipes. Multi-worker = multi-cache.
- **Fix:**
  1. Add `redis` to `pyproject.toml`. Add `REDIS_URL` env.
  2. Abstract a small `Cache` interface: `.get(key)`, `.set(key, value, ttl)`, `.delete(prefix)`.
  3. Concrete `RedisCache` and `InProcessCache` (fallback when no Redis).
  4. Swap `_PRICE_CACHE`, `_FUND_CACHE`, `_QUANT_CACHE`, `_OPT_CACHE`, `_BENCHMARK_CACHE`, `_OVERVIEW_CACHE` to use it.
- **Risk:** Medium. Serialize/deserialize Pandas DataFrames carefully (use pickle or store as records).
- **Gain:** Cold-load UX on restart disappears. Multi-worker deployments become safe.

### 3.5 Persist enrichment job state
- **Problem:** App restart during background enrichment orphans holdings at `enrichment_status=pending`.
- **Fix:**
  1. Add `enrichment_jobs` table: `portfolio_id`, `status (running|done|failed)`, `last_attempt_at`, `last_error`.
  2. On backend startup, find `running` jobs and re-run them.
  3. On enrichment completion, mark `done`. On failure, mark `failed` with error.
- **Risk:** Low-medium.
- **Gain:** No more orphaned portfolios.

### 3.6 Daily auto-snapshot scheduler
- **Problem:** `/changes` needs ≥2 snapshots to be useful; none created automatically.
- **Fix:**
  1. Add a lightweight scheduler (APScheduler in-process OR a Cowork `schedule` skill task if running via Cowork).
  2. 9:00 PM IST daily: create snapshot of active portfolio.
  3. Make it idempotent (skip if one already created today).
- **Risk:** Low.
- **Gain:** History page has content on day 7 of beta.

### 3.7 Move fundamentals thresholds + weighted-aggregate logic to shared backend service
- **Problem:** Thresholds (`PE_CHEAP`, `PE_EXPENSIVE` etc.) and `computeWeightedMetrics` exist in `frontend/src/lib/fundamentals.ts` alongside a Python equivalent in `analytics.py`.
- **Fix:**
  1. Create `app/services/fundamentals_view_service.py`.
  2. All endpoints that need weighted fundamentals (`/analytics/ratios`, advisor, simulation) call this service.
  3. Ship thresholds as part of the API response (e.g. `thresholds: { pe_cheap: 15, pe_expensive: 30 }`).
  4. Frontend reads thresholds from response; removes hardcoded constants.
- **Risk:** Low-medium.
- **Gain:** Threshold changes no longer ship as frontend bundles.

---

## 4. Modules to patch vs rebuild

Not every module needs the same treatment.

### 4.1 Patch (keep the structure, fix the bugs)
- **Upload / Ingestion** — healthy shape; patch the enrichment-resume bug, add file size limit, tighten column detection.
- **Portfolio Aggregation** — add 30–60s response cache, add risk_snapshot + weighted_fundamentals to the bundle, delete legacy sub-endpoints.
- **Market Data** — stable. Minor polish (longer cache TTL, move sector list to config).
- **Watchlist** — stable. Only a v2 alerts feature is interesting.
- **News** — add a 30 min cache; optionally add name-fuzzy-match for recall.
- **Peers** — add per-peer timeout; replace static map with DB-backed seed.
- **Fundamentals** — add per-ticker timeout; centralise thresholds; consider sector-aware weighted view.
- **History / Changes** — add daily scheduler; finalize `/history` daily-value endpoint; move delta logic to backend.

### 4.2 Rebuild (the current implementation has too many cross-cutting issues)
- **Risk / Quant**
  - Current problems: risk snapshot in TS; cache in-process; `/quant/full` bundles 5+ concerns; no persistence of historical metrics.
  - Rebuild: migrate cache to Redis; move risk_snapshot to backend bundle; split `/quant/full` into composable `/quant/metrics`, `/quant/performance`, `/quant/correlation` with a composition endpoint; persist daily metric snapshots for trend display.
- **Advisor**
  - Current problems: two engines producing different answers; no conversation persistence; no tool-use; sprawling 650-line `lib/advisor.ts`; safety copy missing.
  - Rebuild: single backend engine; persist conversations; add tool-use (`get_fundamentals(t)`, `get_peers(t)`, `simulate_rebalance(weights)`); versioned prompts; explicit fallback mode with a "limited" badge; disclaimer footer.

### 4.3 Neither patch nor rebuild — defer
- **Broker Sync** — entire scaffold. Don't touch until beta insights demand it.
- **Frontier / Simulator / Optimize** — hidden from nav at beta. Revisit only if post-beta feedback justifies it.

---

## 5. Risk register (what can go wrong if you execute this plan)

| Change | Risk | Mitigation |
|---|---|---|
| Lift portfolio context (§3.1) | Stale data if invalidation misses an edge | Add invalidation triggers as unit tests. Test upload→dashboard navigation end-to-end. |
| Move risk snapshot to backend (§3.3) | Numeric drift vs existing TS implementation | Write a Python port, run both on 5 sample portfolios, assert ≤1e-6 delta on every metric. Only then delete the TS version. |
| Redis cache (§3.4) | Serialization bugs with DataFrames | Test with real portfolio data; prefer `pickle` or explicit schema serialization. Keep in-process fallback. |
| Single active portfolio endpoint (§3.2) | Latent code reads `portfolioStore.activePortfolioId` | Delete the store; let TS compile errors guide the cleanup. |
| Delete `/ai-chat`, `/sectors` (§2.3) | Someone has a bookmark | Add 301 redirect for 30 days; fine to hard-delete after that. |
| Auto-snapshot scheduler (§3.6) | Duplicate snapshots / clock drift | Idempotent (skip if one exists today). Log every attempt. |
| Split `/quant/full` (§4.2) | Frontend needs rework to compose | Do backend change; keep `/quant/full` as a composition endpoint that calls the new sub-endpoints. Frontend can adopt incrementally. |
| Advisor tool-use (§4.2) | LLM API cost increase | Add a per-session query cap. Budget-track in logs. |

---

## 6. Recommended chronological order (12-week plan)

### Week 1 — Stop the bleeding
- §2.1 per-ticker timeout on analytics/ratios
- §2.2 per-peer timeout on peers
- §2.3 delete ai-chat + sectors
- §2.4 kill dead mock branches
- §2.5 hide Tier-3 pages from nav
- §2.6 upload size limit
- §2.7 advisor disclaimer footer

### Week 2–3 — Ship the "one source of truth" refactors
- §3.1 lift portfolio context to AppShell
- §3.2 single active-portfolio endpoint

### Week 4 — Move intelligence to backend (part 1)
- §3.3 risk_snapshot in backend + shipped via `/portfolio/full`
- §3.7 fundamentals thresholds + weighted service centralised

### Week 5 — Infrastructure for beta
- §3.4 Redis cache layer
- §3.5 enrichment job state persistence
- §3.6 daily auto-snapshot scheduler

### Week 6 — Observability
- Sentry (backend + frontend)
- OpenTelemetry or simple metrics on endpoint latency
- Dashboard: per-endpoint p50/p95, cache hit rates, external API failure counts

### Week 7 — Advisor rebuild (part 1)
- Single backend engine (deprecate `lib/advisor.ts` computation; keep only "LLM unavailable" fallback)
- Conversation persistence
- Versioned prompts directory

### Week 8 — Advisor rebuild (part 2)
- Tool-use (`get_fundamentals`, `get_peers`, `simulate_rebalance`)
- Per-session query cap
- Full eval suite (20 canonical queries × 3 portfolios)

### Week 9 — Quant rebuild
- Split `/quant/full` into composable endpoints
- Persist daily metrics
- Trend chart on `/risk`

### Week 10 — Beta launch prep
- End-to-end tests against 3 real broker CSVs (Zerodha, ICICI Direct, HDFC)
- Load test (50 concurrent users, 20 holdings each)
- Backup automation for SQLite
- Privacy policy, terms of use
- Send 5 invites for internal dogfooding; fix any findings

### Week 11 — Staged beta invites
- 5 invites → fix findings → 10 → 25

### Week 12 — Observe + iterate
- Watch the success metrics from PRD §2.
- If any kill criteria hit (PRD §13), stop inviting, fix, resume.

---

## 7. What should be done before beta (non-negotiable)

Concatenated from the plan above:
- All of §2 (immediate fixes).
- §3.1, §3.2, §3.3, §3.5, §3.6, §3.7 (structural fixes with direct UX impact).
- §3.4 (Redis) if hosting on >1 worker.
- Week 6 observability.
- Advisor disclaimer + conversation persistence.
- 3-broker-CSV end-to-end test.

**Without these, beta feedback will be dominated by infrastructure complaints, not product learnings.**

---

## 8. What should wait until after beta

- Advisor tool-use (§4.2 part 2).
- Quant split + persistence (§4.2 first bullet).
- Fundamentals sector-aware weighted view.
- News dedup + sentiment.
- Peer map expansion beyond static.
- Alembic migrations (needed only when switching to Postgres; SQLite is fine for private beta).
- Broker sync.
- Anything marked "v2" or "postponed" in the PRD.

---

## 9. The honest state-of-the-code scorecard

| Dimension | Grade | Note |
|---|---|---|
| Backend layering (routes → services → providers → repos) | B+ | Mostly clean; providers leak optional fields; services sometimes skip repos in favour of providers. |
| Frontend data-fetching pattern | C | No shared context, no SWR, redundant fetches on navigation. |
| Frontend state management | B | Zustand usage is clean but `simulationStore` is a hack and `portfolioStore` duplicates backend state. |
| Intelligence location (where is "the math"?) | D | Risk, advisor, insights, fundamentals thresholds all in frontend TS. Biggest architectural debt. |
| Cache strategy | C- | In-process everywhere; restart wipes everything; no shared cache across workers. |
| Provider pattern | B | Right idea; informal contract; extra fields leak. |
| Error handling | B- | Graceful per-section for most endpoints; missing per-ticker timeouts in 2 places. |
| Test coverage | ? | `backend/tests/` exists — contents unverified. Add to the week-1 audit. |
| Schema migrations | D | Manual `ALTER TABLE` in `init_db.py`. Works for SQLite single-user; cannot survive Postgres. |
| Observability | F | Logs only. No metrics. No error reporting. |
| Documentation (before this phase) | B | Existing docs (`01-architecture`, `02-status`, `codebase-intelligence-audit`) are good but descriptive, not contract-driven. This docs phase fixes that. |

**The pattern:** the app is decently structured; the intelligence is in the wrong layer; the infrastructure is thin. All fixable in the 12-week plan.

---

## 10. How to use this blueprint going forward

- When someone files a bug or feature request, ask: "does this violate a contract in `module-contract-blueprint.md`?" If yes, fix the contract + tests first. If no, it's a normal ticket.
- When someone proposes a new page, ask: "is this in `product-requirements-mvp.md`?" If no, park it.
- When someone proposes a refactor, ask: "is this in §3 or §4 of this document, and is it my current phase?" If no, defer.

This blueprint is only as valuable as the discipline to stick to it.
