# P-Insight — Data Flow & Dependency Map

**Status:** Current-state snapshot, April 2026.
**Purpose:** For every important page/feature, one row that answers: which hook → which endpoint → which service → which provider → which external dependency. Plus failure behaviour and cross-module dependencies.

> Use this as a debugging cheat-sheet. When something breaks on a page, start here to trace where.

---

## Legend

- **Route** — frontend URL.
- **Hooks used** — all hooks mounted on that page or in its key components.
- **Endpoints called** — exact backend URL(s) hit, in the order hit.
- **Backend service/provider** — the layer that does the work behind the endpoint.
- **Data deps** — what upstream data must already exist (uploaded portfolio, benchmark, LLM key, etc.).
- **Failure behaviour** — what user sees when things break.
- **Depends on** — other modules/pages/features it implicitly requires.

---

## 1. `/upload`

| Field | Value |
|---|---|
| Route | `/upload` |
| Hooks used | none (form-driven; uses `portfolioApi` directly) |
| Endpoints called | `POST /api/v1/upload/parse` → `POST /api/v1/upload/confirm` → poll `GET /api/v1/upload/status` |
| Backend service/provider | `UploadV2Service` + `FileDataProvider` (populates in-memory cache) + `QuantAnalyticsService.pre_warm_cache()` + `OptimizerService.pre_warm_cache()` (background) |
| Data deps | Valid CSV/Excel file. Optional: FMP key for richer enrichment. |
| Failure behaviour | Parse errors return HTTP 4xx with row-level messages. Invalid rows classified and shown before confirm. Enrichment failures are silent per-ticker (sector = "Unknown"). App restart during enrichment = orphaned `pending` rows (bug). |
| Depends on | SQLite write access, yfinance availability (soft), static sector map |

---

## 2. `/dashboard`

| Field | Value |
|---|---|
| Route | `/dashboard` |
| Hooks used | `usePortfolio`, `useDataMode`, `useWatchlistPrices` (for sub-strip) |
| Endpoints called | `GET /api/v1/portfolio/full?mode=...` (single bundle). **No `/quant/full` call** (removed in April 2026 hardening). |
| Backend service/provider | `PortfolioService.get_full()` → active provider → yfinance/in-memory |
| Data deps | Uploaded portfolio present for `mode=uploaded`, active `Portfolio.is_active=True` for `mode=live` |
| Failure behaviour | No portfolio → empty state with "Upload your first portfolio" CTA. `/portfolio/full` fails → generic error banner. Risk tiles still render from `computeRiskSnapshot` if holdings present. |
| Depends on | Portfolio Aggregation module, Risk compute (frontend), Action Center insights (frontend), Advisor panel (renders inline but deferred) |

---

## 3. `/holdings`

| Field | Value |
|---|---|
| Route | `/holdings` |
| Hooks used | `usePortfolio` |
| Endpoints called | `GET /api/v1/portfolio/full?mode=...` (usually cached by previous page but refetched because there's no shared context) |
| Backend service/provider | Same as dashboard |
| Data deps | Uploaded or live portfolio |
| Failure behaviour | Empty state if no holdings. Row-level `data_source` flags if some prices missing. |
| Depends on | Portfolio Aggregation |

---

## 4. `/fundamentals`

| Field | Value |
|---|---|
| Route | `/fundamentals` |
| Hooks used | `usePortfolio`, `useFundamentals(holdings)` |
| Endpoints called | `GET /api/v1/portfolio/full?mode=...` → `GET /api/v1/analytics/ratios?mode=...` |
| Backend service/provider | Portfolio: `PortfolioService`. Ratios: `endpoints/analytics.py` → `provider.get_fundamentals(ticker)` per holding + `_compute_weighted_metrics()`. |
| Data deps | yfinance reachable; FMP optional. |
| Failure behaviour | No per-ticker timeout guard → known: one slow yfinance ticker blocks ≥20s. Per-ticker failure → that row's ratios null; weighted aggregate excludes it. `source` field lets UI show caveats. |
| Depends on | Fundamentals module, yfinance availability |

---

## 5. `/risk`

| Field | Value |
|---|---|
| Route | `/risk` |
| Hooks used | `usePortfolio`, `useQuantAnalytics` (mounts on page load) |
| Endpoints called | `GET /api/v1/portfolio/full?mode=...` → `GET /api/v1/quant/full?mode=...&period=1y` |
| Backend service/provider | `QuantAnalyticsService.compute_all(period)` — concurrent price fetch + analytics pipeline. Cached 10 min live / 24h mock. |
| Data deps | ~1y price history per ticker; benchmark (NIFTY 50) optional — metrics that need benchmark are null if unavailable. |
| Failure behaviour | Cold cache → 5–20s blocking load. Benchmark unavailable → `meta.benchmark_available=False`, beta/alpha/IR null. Risk snapshot card still renders from client-side `computeRiskSnapshot` (independent of quant). |
| Depends on | Quant/Risk module, yfinance price history |

---

## 6. `/optimize`

| Field | Value |
|---|---|
| Route | `/optimize` — **Tier 3, hidden** |
| Hooks used | `useOptimization(period, er_method, cov_method)` |
| Endpoints called | `GET /api/v1/optimization/full?mode=...&period=...&er_method=...&cov_method=...` |
| Backend service/provider | `OptimizerService.compute()` — fetches prices, computes covariance (sample/ledoit_wolf/auto), expected returns, runs PyPortfolioOpt, returns min-var + max-Sharpe + frontier + rebalance deltas. Cached 10 min live / 24h mock. |
| Data deps | Price history; benchmark not needed. |
| Failure behaviour | <5 holdings or degenerate covariance → PyPortfolioOpt can raise → endpoint returns partial/error. Hidden from nav so impact limited. |
| Depends on | Optimisation module (= Quant price pipeline reused) |

---

## 7. `/simulate`

| Field | Value |
|---|---|
| Route | `/simulate` — **Tier 3, hidden** |
| Hooks used | `useSimulation` (which internally uses `usePortfolio`, `useFundamentals`, `useWatchlist`, `useOptimization`) |
| Endpoints called | Indirect: `/portfolio/full` → `/analytics/ratios` → `/watchlist/` → `/optimization/full` (all on mount — expensive) |
| Backend service/provider | All of the above chained |
| Data deps | Uploaded portfolio + fundamentals + watchlist + optimisation output |
| Failure behaviour | Slow cold load (triggers every downstream expensive endpoint). Optimisation failure doesn't block sim editing but removes suggestion quality. State persisted in `simulationStore` across navigation. |
| Depends on | Portfolio, Fundamentals, Watchlist, Optimisation, client-side `lib/simulation.ts` engine |

---

## 8. `/advisor`

| Field | Value |
|---|---|
| Route | `/advisor` |
| Hooks used | `useAdvisor` (which uses `usePortfolio`, `useFundamentals`, `useWatchlist`, `useSnapshots`) |
| Endpoints called | `GET /api/v1/advisor/status` (on mount) → `POST /api/v1/advisor/ask` (per query) |
| Backend service/provider | `AIAdvisorService` → `context_builder` → `ai/provider.py` (Claude / OpenAI). Fallback: frontend `lib/advisor.ts → routeQuery()`. |
| Data deps | LLM API key (optional). Full engineInput from hooks above. |
| Failure behaviour | No key → provider badge "Rule-based", local engine answers. AI error → silent fallback to local rule-based. Empty portfolio → advisor says "upload first". **Two engines can produce different answers for the same query.** |
| Depends on | Portfolio, Fundamentals, Watchlist, Snapshots, optionally LLM |

---

## 9. `/peers`

| Field | Value |
|---|---|
| Route | `/peers` |
| Hooks used | `usePeerComparison(ticker)` |
| Endpoints called | `GET /api/v1/peers/{ticker}?mode=...` |
| Backend service/provider | `endpoints/peers.py` → `provider.get_peers(ticker)` (static map or FMP) + `asyncio.gather` of `provider.get_fundamentals(ticker)` for selected + peers |
| Data deps | Static peer map hit OR FMP key configured. yfinance reachable per ticker. |
| Failure behaviour | Ticker not in map + no FMP = empty peer list. One peer hangs → whole response can block 15+s (known issue). |
| Depends on | Fundamentals fetch, static peer map |

---

## 10. `/watchlist`

| Field | Value |
|---|---|
| Route | `/watchlist` |
| Hooks used | `useWatchlist`, `useWatchlistPrices` (live mode only) |
| Endpoints called | `GET/POST/PUT/DELETE /api/v1/watchlist/` |
| Backend service/provider | `endpoints/watchlist.py` → `WatchlistRepository` → SQLite |
| Data deps | DB only. Live prices optional. |
| Failure behaviour | DB error → optimistic update rolls back, toast error. Live price fetch failure → "—" shown; row remains. |
| Depends on | SQLite; `LiveAPIProvider` for price enrichment |

---

## 11. `/news`

| Field | Value |
|---|---|
| Route | `/news` |
| Hooks used | `useNews(filters)` |
| Endpoints called | `GET /api/v1/news/?tickers=...&event_type=...` (+ `/news/events` scaffold) |
| Backend service/provider | `endpoints/news.py` → `provider.get_news()` → NewsAPI call |
| Data deps | `NEWS_API_KEY` env var. Active portfolio holdings (used as default ticker filter). |
| Failure behaviour | No key → `news_unavailable=True`, empty list, "configure NewsAPI" banner. Rate-limit or network failure → same graceful empty. |
| Depends on | NewsAPI, Portfolio (for default filter) |

---

## 12. `/market`

| Field | Value |
|---|---|
| Route | `/market` — landing page |
| Hooks used | `useIndices` (polls every 120s) |
| Endpoints called | `GET /api/v1/market/overview` |
| Backend service/provider | `endpoints/market.py` — concurrent `ThreadPoolExecutor` per-index yfinance fetch, batched `yf.download` for gainers/losers. Cached 2 min in-process. |
| Data deps | yfinance availability. Static list of 3 indices + 8 sectors. |
| Failure behaviour | Per-section graceful: one index times out → that chip "unavailable", others render. Weekend → gainers/losers often empty (expected). Topbar `IndexTicker` shows status dot (emerald=live, grey=last_close, amber=stale). |
| Depends on | yfinance only |

---

## 13. `/changes`

| Field | Value |
|---|---|
| Route | `/changes` |
| Hooks used | `useSnapshots`, `useSnapshotHistory`, `useDelta` |
| Endpoints called | `GET /api/v1/snapshots/` → `GET /api/v1/snapshots/{id}` → `GET /api/v1/snapshots/delta?from=...&to=...` |
| Backend service/provider | `endpoints/snapshots.py` → `SnapshotService` → SQLite |
| Data deps | ≥2 snapshots in DB. |
| Failure behaviour | Zero snapshots → empty state with "Take your first snapshot" CTA. One snapshot → different empty state. API error → generic error. |
| Depends on | Snapshot module, SQLite |

---

## 14. `/portfolios`

| Field | Value |
|---|---|
| Route | `/portfolios` |
| Hooks used | `usePortfolios`, `portfolioStore` |
| Endpoints called | `GET /api/v1/portfolios/` → `PUT /api/v1/portfolios/{id}/active` → `DELETE /api/v1/portfolios/{id}` |
| Backend service/provider | `endpoints/portfolios_mgmt.py` → `PortfolioManager` → SQLite |
| Data deps | None beyond DB. |
| Failure behaviour | Delete of active portfolio is not (visibly) guarded; may leave no active portfolio, which the live provider then returns empty for. |
| Depends on | SQLite only |

---

## 15. `/brokers` (scaffold)

| Field | Value |
|---|---|
| Route | `/brokers` — **Tier 3, scaffold** |
| Hooks used | `useBrokerConnections` |
| Endpoints called | `GET /api/v1/brokers/` (stub) |
| Backend service/provider | `endpoints/brokers.py` → `BrokerService` (stub) |
| Data deps | None (no integration) |
| Failure behaviour | Always degraded; just a UI scaffold |
| Depends on | Zerodha/IBKR integration (not implemented) |

---

## 16. `/sectors`, `/ai-chat`, `/frontier`, `/screener`, `/debug` (hidden / deprecated / dev)

These are either:
- `sectors` — redundant with dashboard sector view. Nav link removed. Candidate for deletion.
- `ai-chat` — superseded by `/advisor`. Candidate for deletion.
- `frontier` — redirects to `/optimization/full`. Scaffold.
- `screener` — status unknown; not part of MVP.
- `debug` — dev-only panel gated by `NODE_ENV === 'development'`.

Do not rely on these for user flows.

---

## 17. Topbar / AppShell (always present)

| Field | Value |
|---|---|
| Hooks used | `useIndices` (poll `/market/overview` 120s), `useDataMode`, `usePortfolios` (portfolio switcher) |
| Endpoints called | `GET /api/v1/market/overview` (every 2 min), `GET /api/v1/portfolios/` (on mount) |
| Failure behaviour | `IndexTicker` shows per-chip status; stale data kept visible via `lastGoodRef`. Portfolio switcher empty if DB empty. |
| Depends on | Market module, PortfolioManager |

---

## 18. Cross-page dependencies (matrix view)

Rows = pages. Columns = modules they depend on.

|  | Upload | Portfolio | Fundamentals | Quant | History | Peers | Market | Watchlist | News | Advisor |
|---|---|---|---|---|---|---|---|---|---|---|
| `/upload` | self | writes | triggers (bg) | warms cache (bg) | — | — | — | — | — | — |
| `/dashboard` | — | **req** | — | — | — | — | — | — | — | reads |
| `/holdings` | — | **req** | — | — | — | — | — | — | — | — |
| `/fundamentals` | — | **req** | **req** | — | — | — | — | — | — | — |
| `/risk` | — | **req** | — | **req** | — | — | — | — | — | — |
| `/optimize` | — | **req** | — | shares price pipeline | — | — | — | — | — | — |
| `/simulate` | — | **req** | **req** | shares price pipeline | — | — | — | **req** | — | — |
| `/advisor` | — | **req** | **req** | — | **req** | — | — | **req** | — | self |
| `/peers` | — | — | **req** | — | — | self | — | — | — | — |
| `/watchlist` | — | — | — | — | — | — | — | self | — | — |
| `/news` | — | defaults | — | — | — | — | — | — | self | — |
| `/market` | — | — | — | — | — | — | self | — | — | — |
| `/changes` | — | — | — | — | self | — | — | — | — | cross-links |
| Topbar | — | reads | — | — | — | — | reads | — | — | — |

**"req"** = the page will not function without this module.
**"self"** = this page is the primary surface for that module.
**"bg"** = happens as a background task, not blocking.

---

## 19. Shared data & the redundant-fetch problem

The biggest hidden inefficiency is that `/portfolio/full` is called independently on **every page** because `usePortfolio` is per-page, not shared context.

**Concrete bad path:**

```
User lands on /dashboard        → fetch /portfolio/full
User clicks "Holdings"          → fetch /portfolio/full (again)
User clicks "Fundamentals"      → fetch /portfolio/full (again) + /analytics/ratios
User clicks "Risk"              → fetch /portfolio/full (again) + /quant/full (possibly cold)
User clicks "Advisor"           → fetch /portfolio/full (again) + /analytics/ratios (again) + /watchlist + /snapshots
```

Backend caching partially saves this for `/portfolio/full` because the provider caches prices for 60s. But the network round-trip and JSON deserialization still happens 5× in <30s.

Fix: lift `usePortfolio` into a single provider at AppShell level, fetch once per `(mode, active_portfolio_id)` and subscribe from pages. Invalidate on upload + mode change + portfolio switch. Status doc §7.6 covers this.

---

## 20. External dependency map

```
yfinance
  ├── /market/overview
  ├── /quant/full (price histories)
  ├── /optimization/full (price histories)
  ├── /analytics/ratios (per-holding fundamentals)
  ├── /peers/{ticker} (fundamentals for each peer)
  ├── /portfolio/full via LiveAPIProvider (current prices)
  └── Upload enrichment (per-ticker sector + fundamentals)
→ yfinance is the single point of failure for ~80% of the app.

FMP (optional)
  ├── Upload sector enrichment (fallback)
  ├── /analytics/ratios (fallback)
  └── /peers (peer discovery fallback)

NewsAPI (optional)
  └── /news

Anthropic / OpenAI (optional, either-or)
  └── /advisor AI path

SQLite (local)
  ├── portfolios, holdings
  ├── snapshots, history
  ├── watchlist
  └── broker_connections (scaffold)
```

**If yfinance is down, P-Insight becomes read-only on the uploaded snapshot, with no fresh prices, no quant, no fundamentals updates.** No graceful "use last good" fallback at the provider layer — each cache entry just expires and shows "unavailable".

---

## 21. Invalidation map (when to bust caches)

| Event | Caches that should bust |
|---|---|
| New upload confirmed | `_PRICE_CACHE`, `_FUND_CACHE` for that portfolio's tickers; `_QUANT_CACHE`; `_OPT_CACHE`; frontend `usePortfolio` state |
| Active portfolio switched | `_QUANT_CACHE`, `_OPT_CACHE`, frontend `usePortfolio` |
| Data mode toggled | frontend all hooks (mode is cache key partition) |
| Snapshot created | `/changes` UI state |
| Watchlist item added/removed | `useWatchlist` cache |

**Today, most of these are not explicit.** Cache busting relies on TTL expiry. `OptimizerService.invalidate_cache()` exists but is not called from upload. Fix this.

---

## 22. Debugging cheat sheet

- **Dashboard empty but portfolio exists:** check `dataModeStore.mode` value; if `live`, confirm `Portfolio.is_active=True` in DB and yfinance reachable.
- **Fundamentals blank for one ticker:** check `_FUND_CACHE` for that ticker; if absent, yfinance + FMP likely both failed.
- **/risk shows "Loading…" forever:** cold `_QUANT_CACHE`; 5–20s expected; if >30s, one price history fetch is hanging. Check backend logs.
- **Advisor says different things with/without LLM:** this is expected (two engines). Not a bug but a product risk. See advisor module contract.
- **Market chips all grey:** yfinance rate-limited or market closed. Check `/market/overview` response `meta` field.
- **Upload succeeded but fundamentals missing 30 min later:** enrichment background task likely failed or app restarted mid-task. No resume mechanism.
