# P-Insight — Master Action Plan (Consistency, Hardening, Modularity, Monetization)

> Superseded as the live operating plan. Use [EXECUTION_PLAN](docs/EXECUTION_PLAN.md)
> for current batch order and [EXECUTION_STATUS](docs/EXECUTION_STATUS.md) for
> accepted evidence and the linked delivery queue. The historical text below is
> retained for context; it must not override current scope or acceptance gates.

> Historical planning snapshot. The July completion statements below describe
> limited checks at that time, not current production readiness. B00 restores
> the existing foundation work and adds asymmetric-auth regression tests only;
> remaining security, ingestion, reliability and release gates are still open.
> Recheck current repository state before following old synchronization or
> cleanup instructions. Never remove another process's Git lock speculatively.

**Date:** 2026-07-21
**Baseline:** `production-hardening` branch — confirmed the most advanced/functional code, verified directly against the repo (not from the stale audit).
**Companion documents:** `docs/hardening-tracker.md` (your own living phase tracker — keep using it, this plan slots into it) and `P-Insight_Production_Roadmap.md` (monetization detail).

This is the single ordered sequence to run, step by step, to get from "working prototype with drift" to "consistent, modular, hardened, monetizable app." Each phase has an objective, dependencies, the concrete work, and a test you can run yourself without reading code.

---

## Where things actually stand right now (verified, not assumed)

- Local `main` and `production-hardening` are now aligned to the same commit (`46ce3b9`) — I fast-forwarded `main` to match during this session. That part of "align local" is done.
- **GitHub is not yet aligned.** `origin/main` is frozen at a commit from 27 May. Your local repo has two branches (`phase-1-public-surface-cleanup`, `production-hardening`) GitHub has never seen. I can't push from this sandbox — no GitHub credentials are configured here, and there's no GitHub connector available to connect instead. This needs to happen from your own machine. Whenever you're ready:

  ```
  cd "/Users/dhruvtantia/Documents/AI Projects/P-insight"
  rm .git/index.lock          # only if git complains about a stuck lock; safe to remove, it's empty
  git checkout main
  git push origin main
  ```
  (Close VS Code / GitHub Desktop / Cursor first if any of them have this project open — one of them is almost certainly what's holding the lock file I couldn't clear from here.)

- Phase 0 (deps, Alembic, CI, clean baseline) — **done**, per your tracker.
- Phase 1 (auth + tenancy) — **backend done and proven** (Supabase JWT verification, per-user scoping on portfolios/watchlist/brokers/snapshots/history). **Frontend auth wiring is the one open item** — no login/signup pages exist yet, no Supabase client in the frontend.
- Monetization — **not started anywhere** in your tracker's 7 phases. This plan adds it as its own phase, run in parallel with hardening once frontend auth lands.
- One documentation-drift bug already fixed during this session: `docs/hardening-tracker.md` listed Watchlist as still-global; the code already has per-user scoping. Corrected the tracker line.

---

## Foundation decision: full comparison, all 6 branches (2026-07-21 update)

**Correction first:** the connector you added is **Vercel**, not GitHub — I checked (`list_connectors`), and there is no GitHub MCP in the registry at all, so "connecting GitHub" isn't something available here. It doesn't matter for this comparison, though: reading GitHub (fetch, log, diff) never required a connector or credentials — only *pushing* does, and that gap is unchanged from last time.

I fetched every branch and diffed each one against `main` to see what's actually in each, rather than judging by commit messages. Verdict, by branch:

| Branch | Where | What it actually contains | Verdict |
|---|---|---|---|
| `production-hardening` | Local only (unpushed) | All Phase 0/1a/1b work: real deps, Alembic, CI, Supabase auth, per-user tenancy | **This is the foundation.** Not close — everything else is either stale or a small abandoned experiment. |
| `origin/main` | GitHub | The pre-hardening single-user prototype, frozen since 27 May | Worst of the six on every axis. GitHub's "main" is the one to retire. |
| `phase-1-public-surface-cleanup` | GitHub (= local) | Already an ancestor of `production-hardening` — fully absorbed | No unique content left to evaluate. |
| `feat/live-mode-transparency-and-quant-debug` | GitHub (= local) | Diff against `main` is **empty** — already fully merged in | Dead branch, safe to delete once you're comfortable. |
| `rebuild/modular-mvp` | GitHub (= local) | An abandoned May 18 exploration: mostly empty per-domain module stubs (`app/modules/auth/`, `billing/`, `portfolios/`, etc.), **plus two real, finished pieces of work nothing else has**: a 240-line durable background-job service + a `BackgroundJob`/`BackgroundJobStage` ORM model, and an early `upload_v2_service.py` draft | **Worth raiding for parts, not adopting whole.** See below. |
| `backend-module-isolation` | GitHub (= local) | One disciplined, self-contained experiment: `isolated_upload_module.py` (264 lines) — explicitly written to wrap the existing V2 upload path for side-by-side testing, never switched into production | Minor optional value, not urgent. |

**What this means for modularity specifically**, since that's the axis you asked about directly: `production-hardening` itself hasn't changed the overall folder shape from the original audit — it's still the flat `api/ · services/ · repositories/ · models/` split across the whole app, not organized by feature domain. The abandoned `rebuild/modular-mvp` branch had the *right instinct* (one folder per business domain: `modules/portfolios/`, `modules/billing/`, `modules/watchlist/`, etc.) but never got past empty `__init__.py` stubs for most of them — it's a plan, not an implementation. My recommendation: keep `production-hardening`'s working code as-is for now (don't risk a big-bang folder reorg), but adopt the domain-module *shape* as the target pattern for Phase 5's polish pass, moving one feature at a time, only after it's hardened — reorganizing folders and hardening logic in the same change is how regressions hide.

**Two concrete, low-risk imports worth doing**, added to the plan below:
1. `background_job.py` + `background_job_service.py` from `rebuild/modular-mvp` directly shortcuts Phase 3 (durable jobs) — it's well-designed (generic `owner_type`/`owner_id`, a `stages` sub-table for granular progress) and its imports already match `production-hardening`'s current `app/db/database.py` structure, so it's a port-and-test job, not a rewrite.
2. `isolated_upload_module.py` from `backend-module-isolation` is optional reading for whoever does Phase 2's upload-path unification — it already thought through how to wrap V2 safely, even though it was never switched on.

**Not recommended:** merging any of these branches wholesale, or treating GitHub's `main` as authoritative for anything. Once you push from your own machine, `production-hardening`'s tip becomes the new `main` and the four stale/absorbed branches (`origin/main`'s old history aside — that's just superseded by the fast-forward) can be deleted from GitHub — but that's a destructive action, so tell me explicitly when you want that done rather than assuming it.

---

## Stage 0 — Foundation Bootstrap (the "starting line" — nothing below begins until this is done)

Everything in this stage is cross-cutting infrastructure, not a feature. It has to land first because every module below assumes it's already there. Run these four in order, each as its own session, each fully verified before the next starts.

### 0.1 — GitHub alignment ✅ DONE (2026-07-22)
**Objective:** GitHub's `main` matches your real, working codebase instead of a 2-month-old snapshot.
**Dependencies:** None.
**Work:** Cleared a stale empty `.git/index.lock`, committed the Supabase scaffolding + docs that were sitting uncommitted (`95222f6`, "Phase 1c: frontend Supabase auth scaffolding"), fast-forwarded local `main` to `production-hardening`, pushed — clean fast-forward, no force needed since `origin/main` was already an ancestor.
**Verification test:** ✅ `github.com/dhruvtantia/P-insight-Beta-version` `main` tip is now `95222f6`.

### 0.2 — Supabase-ready scaffolding ✅ DONE (2026-07-22)
**Objective:** Decoupled on purpose, per your call: the *code* for Supabase auth doesn't need to wait on a live account, only the actual live testing does.
**Status: scaffolding built and verified.** `frontend/src/lib/supabaseClient.ts`, `frontend/src/context/AuthContext.tsx`, `/login` and `/signup` pages, and `services/api.ts` attaching the access token on every request are all written and wired into `AppShell.tsx`. `backend/app/core/auth.py` already had `AUTH_ENABLED=False` legacy-mode support built in from Phase 1a.
**Verified:** `pnpm install --no-frozen-lockfile`, `pnpm run type-check` clean, `pnpm run build` clean.
**Housekeeping note:** four stray 0-byte `_tmp_*` files/dirs are sitting untracked in the repo root and `frontend/` — harmless, left alone pending your call on whether to delete them.

### 0.3 — Real Supabase project ✅ DONE (2026-07-24)
**Objective:** Swap placeholder env values for a real, live Supabase project.
**Work:** Provisioned project `sfabbkdwezgmxpkbpdjw`, filled all four env values (`SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`) in `backend/.env` and `frontend/.env.local`, flipped `AUTH_ENABLED=true`.
**Two real bugs found and fixed along the way (not just config):**
1. **ES256 vs HS256** — this project (like all new Supabase projects) signs session tokens with asymmetric JWT signing keys (ES256), not the legacy HS256 shared secret. The dashboard confirms this migration is one-way — there's no toggle back to HS256 signing. `backend/app/core/auth.py` only verified HS256. Added JWKS-based verification (`_get_jwks_client` + `PyJWKClient`, dispatching on the token's own `alg` header) with HS256 kept as a fallback for older projects. Required adding the `cryptography` package (`pyproject.toml`, `requirements-lock.txt`).
2. **Stale dev SQLite schema** — `backend/p_insight.db` predated the Phase 1b tenancy migration and was missing `user_id` on `portfolios`/`watchlist`/`broker_connections`, causing a 500 on the first real authenticated request. Added those three columns to `_COLUMN_MIGRATIONS` in `backend/app/db/init_db.py` (the local-dev auto-migrate path; Alembic remains canonical for staging/prod).
**Also found:** no sign-out control existed anywhere in the frontend — the topbar avatar was a hardcoded "DT" placeholder not wired to anything. Added a real user menu to `frontend/src/components/layout/Topbar.tsx` (shows the logged-in email, working "Log out" calling `signOut()`).
**Verified:** backend test suite 76/76 passing throughout; frontend type-check clean; real signup → real login → ES256 token → JWKS verification → per-user scoped API response, all confirmed end-to-end via live browser + direct curl checks.
**Launch-blocking note:** `Authentication → Sign In / Providers → Email → "Confirm email"` was turned off in the Supabase dashboard to allow scripted two-account testing without email round-trips. Must be turned back on before real launch — tracked below in Stage 2.

### 0.4 — Foundation smoke test ✅ DONE (2026-07-24)
**Objective:** Confirm the whole foundation holds together before a single feature module is touched.
**Dependencies:** 0.1–0.3.
**Work:** Two real accounts (`+testA`, `+testB` via Gmail alias) driven through the actual browser UI — signed up, logged in, each uploaded a distinct portfolio (User A: RELIANCE + TCS, ₹47,500; User B: HDFCBANK + ITC, ₹50,500), logged out, switched accounts, confirmed zero bleed both directions.
**Verified at three layers:**
- UI: User B's dashboard showed "No portfolio uploaded yet" before their own upload (proof A's data wasn't visible), and User A's dashboard was unchanged after B's entire session.
- API: unauthenticated request to a protected route → `401`; authenticated request → `200` with correctly scoped, empty-then-populated data.
- Database: direct query confirmed `portfolios.user_id` correctly attributes each upload to its owning user, with pre-existing legacy `user_id=NULL` rows correctly excluded from both scoped views.
- Backend test suite: 76/76 passing.

**Stage 0 is now fully complete. Stage 1 module work can begin.**

---

## Stage 1 — One module at a time

This is the actual "divide it up by feature" structure. Each numbered item below is a single closed session: one module, its own files, its own test, nothing else touched. They're ordered by dependency and risk — earlier ones are load-bearing for later ones. Don't skip ahead or combine two of these in one session even if it feels efficient; that's exactly the "working on everything at once" failure mode you're trying to avoid.

**1. Upload & Ingestion module** (highest priority — everything downstream depends on clean data in)
Objective: one confirm path, not two; the 13-item ingestion checklist closed out one rule at a time.
Files: `upload_confirm_service.py` vs the V2 confirm service (retire one), `ingestion/*`, `sector_enrichment.py:106-111`'s ambiguous boolean.
Reference material: `backend-module-isolation`'s `isolated_upload_module.py` is worth reading before starting — it already thought through how to wrap the V2 path safely, even though it was never switched on.
Test: feed the app a deliberately messy CSV (duplicate tickers, blank price, garbage ticker) and confirm explicit rejection/flagging, never silent zeros.

**2. Watchlist module**
Objective: the frontend `watchlist/page.tsx` stops bypassing `services/api.ts` with a direct `fetch` call — right now that's the one page most likely to silently drop the auth token you just wired in Stage 0.
Files: `frontend/src/app/watchlist/page.tsx`, `WatchlistTable.tsx`, `useWatchlistPrices.ts` (the ones with uncommitted WIP from the original audit — resolve that WIP as part of this module, not separately).
Test: two logged-in test accounts each manage a separate watchlist with zero cross-contamination, live quotes load through the real API client.

**3. Fundamentals & Risk/Quant module**
Objective: same fetch-bypass fix applied to `fundamentals/page.tsx` and `risk/page.tsx`; fix the FMP `dividend_yield` bug (it's mapping per-share `lastDiv`, not an actual yield).
Files: those two pages, `services/fundamentals_view_service.py`, the FMP provider adapter.
Test: fundamentals page shows correct dividend yield for a known stock, checked against a public source.

**4. Durable Jobs module**
Objective: enrichment survives a backend restart instead of stranding holdings on "pending" forever.
Files: port `background_job.py` + `background_job_service.py` from the abandoned `rebuild/modular-mvp` branch (already compatible with your current `app/db/database.py`) rather than building from scratch; wire it into `post_upload_workflow.py`.
Test: start an upload, kill the backend mid-enrichment, restart, confirm the job resumes instead of sticking.

**5. Optimizer & Advisor module**
Objective: the optimizer reports genuine SLSQP/Ledoit-Wolf output, and the advisor calls Claude with a clean rule-based fallback.
Files: `optimization/frontier.py`, `optimization/covariance.py`, `services/ai/provider.py`. `scipy`/`scikit-learn`/`anthropic` are already installed — this is wiring, not installing.
Test: run the optimizer on the same portfolio before/after; the result visibly differs from the Monte Carlo baseline and the response says which method ran.

**6. Monetization module** (can run any time after Stage 0 — independent file surface from 1–5, full detail in `P-Insight_Production_Roadmap.md`, milestones M0–M6)
Objective: a logged-in user can subscribe, get billed, get gated by plan.
Test: test-mode checkout completes from the real UI, `subscriptions` row appears correctly, cancellation via webhook updates it automatically.

**7. Market / News / Peers module** (lower priority polish)
Objective: honest empty/degraded states — Market Overview's beta placeholders, News's "no news" vs "not configured" distinction, Peer Comparison's static universe labeled as such.
Test: each surfaces its real data-quality state, never a silent blank.

**8. Broker Sync module** (optional, do last, lowest confidence per your own tracker)
Objective: a real broker connects and syncs holdings, encrypted token storage.
Test: a real broker account connects and holdings land in the DB correctly.

---

## Stage 2 — Deployment & launch (after every Stage 1 module is either done or deliberately deferred)

**Objective:** Live, secure, monitored, and actually on GitHub too.
**Dependencies:** Stage 0 fully done; Stage 1 items 1–6 done (7 and 8 can be consciously deferred past launch if you decide they're not worth it yet — that's a real option, not a failure).
**Work:** Dockerfiles, hosting, HTTPS, Sentry/monitoring, `/debug` gated, secrets out of `.env`, frontend E2E suite (signup → upload → dashboard → billing), final security review. **Launch-blocking Supabase setting to revert:** `Authentication → Sign In / Providers → Email → "Confirm email"` was turned **off** during Stage 0.4 to allow scripted two-account testing without email confirmation round-trips — turn it back **on** before going live, or anyone can sign up with an unverified email.
**Verification test:** From your phone, on cellular data, sign up as a new user, upload a real portfolio, subscribe, and see it work — no terminal required.

---

## The one rule that matters most

One module, one session, one set of files. If a session for the Upload module starts touching billing code, or a Monetization session starts "helpfully" fixing ingestion bugs, stop it — that's exactly the cross-contamination that causes regressions you won't catch. Your own tracker's phase discipline is good; what was missing was the explicit foundation/feature-module split and the monetization lane, both written down above now.

**Stage 0 (0.1–0.4) is fully done and verified (2026-07-24)** — see status above. Next up is **Stage 1, module 1: Upload & Ingestion** — the highest-priority module since everything downstream depends on it.
