# P-Insight Hardening Tracker

The single source of truth for what needs hardening before public launch. Seeded from
`AUDIT_REPORT.md` (2026-07-17) and the Phase-0 code exploration. Updated at the end of every phase.

**Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⏸️ deliberately deferred

Last updated: **2026-07-19 (Phase 1 — backend tenancy landed & proven; frontend + a few read-paths remain)**

---

## Cross-cutting foundations

| Item | Status | Notes / blocking gaps | Phase |
|---|---|---|---|
| Repo hygiene / clean baseline | ✅ | `production-hardening` branch; WIP + audit docs committed; tree clean | 0 |
| Smart-feature deps installed | ✅ | scipy 1.18, scikit-learn 1.9, anthropic 0.117 in venv; optimizer logs "SLSQP enabled" | 0 |
| Dependency manifest honest | ✅ | `pyproject.toml` updated; `requirements-lock.txt` frozen (Poetry unusable locally — broken Homebrew py3.14 pyexpat) | 0 |
| Alembic migrations | ✅ | `backend/alembic/` wired to app settings + `Base.metadata`; initial migration reproduces all 8 tables on empty DB | 0 |
| PostgreSQL as prod DB | 🟡 | Migration is dialect-agnostic; `docker-compose.dev.yml` provides Postgres; real prod DB pending hosting choice | 0→7 |
| CI pipeline | ✅ | `.github/workflows/ci.yml`: ruff + pytest + alembic-on-Postgres + FE build/type-check | 0 |
| **Auth + tenancy** | 🟡 | Identity foundation + **per-user scoping done & proven**: portfolios, watchlist, brokers, upload-V2, advisor, and provider reads all scoped by `user_id`; global auth gate on `/api/v1`; per-user active portfolio; 3 isolation tests (two users can't see/mutate each other's data, 401 unauth). **Remaining:** per-ID scoping on snapshots/history/news + legacy upload-confirm (currently protected by the global 401 gate but not per-user filtered), and the **frontend Supabase integration** (needs a real Supabase project) | 1 |
| Durable background jobs | ⬜ | FastAPI `BackgroundTasks` non-durable; history-build status in-memory (lost on restart) | 3 |
| Shared cache (Redis) | ⬜ | `_PRICE_CACHE`/`_FUND_CACHE`/quant caches are in-process module dicts, not multi-worker safe | 3 |
| Provider retry/fallback | ⬜ | yfinance is a single point of failure across 7 features | 3 |
| Secrets management | ⬜ | `.env` file; needs managed secrets + per-feature key validation | 6→7 |
| Frontend tests | ⬜ | Zero FE unit/E2E tests today | 7 |
| Deployment infra | ⬜ | No Dockerfile/hosting/monitoring yet | 7 |
| Security review | ⬜ | Run `/security-review` on auth, tenancy, token storage, upload | 7 |

---

## Feature-by-feature hardening (22 features)

| # | Feature | Status | Key gaps to harden | Phase |
|---|---|---|---|---|
| 1 | App Shell & Navigation | ✅ | Solid; hides disabled features via registry | — |
| 2 | Feature Registry | ✅ | Solid; add auth dependency to the gate stack | 1 |
| 3 | Portfolio Core | 🟡 | Now **tenant-scoped** (per-user active portfolio via `PortfolioReadService`/provider `user_id`); frontend auth wiring remains | 1 |
| 4 | Upload & Import | 🟡 | Two divergent confirm paths (legacy vs V2); non-durable enrichment | 2,3 |
| 5 | Portfolio Management & Refresh | 🟡 | Works; no user scoping | 1 |
| 6 | Dashboard | 🟡 | Add data-quality banner (live/uploaded/fallback/failed price counts) | 3 |
| 7 | Holdings | 🟡 | Per-row price chips good; cost-basis fallback can hide at summary level | 3 |
| 8 | Sector Allocation | ✅ | Unknown sectors marked explicitly | — |
| 9 | Fundamentals & Valuation | 🟡 | Coverage/exclusion visibility; FE↔BE threshold drift; FMP `dividend_yield` bug | 3,5 |
| 10 | Peer Comparison | 🟡 | Peer universe largely static map; not a first-class registry feature | 5 |
| 11 | Risk & Quant Analytics | 🟡 | Collapses if yfinance history unavailable; needs provider fallback | 3 |
| 12 | Optimization & Efficient Frontier | 🟡 | **scipy/sklearn now installed → SLSQP + Ledoit-Wolf active**; expose method in meta + tests | 4 |
| 13 | Simulation / Rebalancing | 🟡 | Client-only sandbox; label clearly as non-persistent what-if | 5 |
| 14 | History, Changes, Snapshots | 🟡 | In-memory build status; snapshots don't persist risk metrics | 3,5 |
| 15 | Market Overview | 🟡 | Single provider; beta placeholder cards; needs last-known-good cache | 3,5 |
| 16 | News & Corporate Events | 🟡 | Provider-key dependent; empty state reads like "no news"; add `not_configured` | 5 |
| 17 | Watchlist | 🟡 | **Global** (unique ticker, no user); live-quote errors swallowed (WIP committed) | 1,5 |
| 18 | AI Advisor & NL Q&A | 🟡 | **anthropic now installed** → wire real Claude; consolidate FE/BE fallback split | 4 |
| 19 | Action Center & Recommendations | 🟡 | Rule-based; logic split FE/BE | 4,5 |
| 20 | Broker Sync | ⬜ | Scaffold; holdings-write path already wired; needs AA connector + encrypted token storage | 6 |
| 21 | Stock Screener | ⏸️ | Hidden `notFound()`; no backend engine — deferred until post-launch | — |
| 22 | Diagnostics | 🟡 | Works; must be admin/auth-gated in production | 1 |

---

## Ingestion validation gaps (Phase 2 checklist)

The 13 concrete gaps found in the ingestion/enrichment trace. Each becomes a validation rule + test.

1. ⬜ ISIN handling disagrees between legacy (rejects) and V2 (accepts-then-fails) — unify.
2. ⬜ No ticker format validation (garbage strings pass, fail enrichment silently).
3. ⬜ Lossy/silent numeric coercion (`normalizer._clean_numeric` trailing-alpha strip).
4. ⬜ `current_price` never validated (0/negative accepted, stamped as *trusted*).
5. ⬜ Warning thresholds accept extreme data; no cross-field (qty×price) sanity.
6. ⬜ Duplicate tickers collide in `patch_holdings_enrichment` (only one row enriched).
7. ⬜ Unparseable dates stored verbatim (`_clean_date` fall-through).
8. ⬜ Header collisions silently drop columns (`detect_columns` first-wins).
9. ⬜ Per-holding fundamentals unverified at write time (only sanity-filtered at aggregation).
10. ⬜ FMP `dividend_yield` maps per-share `lastDiv` — genuinely wrong data.
11. ⬜ `.NS`/`.BO` variant resolution can pick the wrong exchange.
12. ⬜ Enrichment fully best-effort — all exceptions swallowed, always HTTP 200.
13. ⬜ `partially_enriched` operator-precedence bug (`sector_enrichment.py:106-111`).

---

## Phase gates

- **Phase 0** ✅ — clean baseline, deps, Alembic reproduces schema, CI, this tracker. (Tests green: 64 passed.)
- **Phase 1** ⬜ — every route user-scoped; two users fully isolated; no global state.
- **Phase 2** ⬜ — one confirm path; torture-CSV classified deterministically; no silent bad data.
- **Phase 3** ⬜ — enrichment survives restart; provider outages visible; dashboard data-quality banner.
- **Phase 4** ⬜ — optimizer reports SLSQP; advisor calls Claude with clean fallback.
- **Phase 5** ⬜ — every feature green or consciously deferred.
- **Phase 6** ⬜ — end-to-end broker sync → holdings in DB; tokens encrypted.
- **Phase 7** ⬜ — E2E green; deployed over HTTPS; security review clean.
