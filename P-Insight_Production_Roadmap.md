# P-Insight — Production & Monetization Roadmap (Corrected)

**Prepared as:** Principal Software Architect / Technical PM review
**Sources:** `AUDIT_REPORT.md` (2026-07-17) **and** the live `production-hardening` branch + `docs/hardening-tracker.md`, checked directly against your project folder on 2026-07-21.
**Supersedes:** an earlier draft of this file, which was written from the audit alone before I checked the actual repo. That draft is now wrong in places — see the correction note below before reading anything else.

---

## Correction note — read this first

You handed me `AUDIT_REPORT.md` and asked me not to write code, only to plan. I did that, and my first draft was a reasonable plan *if the audit were current*. It isn't. I have direct access to your actual project folder, and a look at the real repo shows you've moved well past the audit in the four days since it was written:

- You're on a `production-hardening` branch, **1 commit ahead of where the audit was taken**, with real commits: "Phase 0: production-hardening foundations," "Phase 1a: backend auth & tenancy identity foundation (Supabase)," "Phase 1b: per-user query scoping + global auth gate," "Phase 1b: scope snapshots & history per-user."
- `backend/app/core/auth.py` already exists and does exactly what I was about to recommend: verifies a Supabase-issued JWT (HS256, `SUPABASE_JWT_SECRET`), get-or-creates a local `users` row keyed on the Supabase `sub`, and falls back to legacy unscoped behavior when `AUTH_ENABLED=False`. This is good, sound work — better than a first draft usually is.
- Alembic is wired and has two real migrations (initial schema + tenancy/user_id). `docker-compose.dev.yml` already provisions Postgres and Redis. `.github/workflows/ci.yml` already runs ruff + pytest + an Alembic-against-Postgres check + frontend build/type-check.
- `scipy`, `scikit-learn`, and `anthropic` are **already installed** (`requirements-lock.txt`) — the "dependency honesty" problem the audit flagged is already being fixed in code, not deferred.
- You already have a living tracker at `docs/hardening-tracker.md`, phased 0–7, that is more detailed and more current than the audit itself.

So: my original Milestones 0–6 (git hygiene, Supabase provisioning, Alembic, backend JWT, frontend auth scaffold, tenancy schema, route guards) are **largely already done or in progress on your own branch.** Re-running them would be redundant work at best and a regression risk at worst if an AI session "fixes" something that isn't broken. I'm not going to hand you a plan that ignores work you've already shipped.

**One thing your own tracker has wrong, for what it's worth:** `docs/hardening-tracker.md` still lists Watchlist as "🟡 Global (unique ticker, no user)" in the feature table. I checked `backend/app/models/portfolio.py` directly — the `Watchlist` model already has a `user_id` column and a `UniqueConstraint("user_id", "ticker")`. The code is ahead of your own tracker on this one point. Small thing, but it's the same documentation-drift pattern the audit criticized the README for, now happening one level down in your own internal docs. Worth a one-line fix to the tracker so the next session (yours or mine) doesn't get confused.

**The actual gap, confirmed by direct inspection:** across all 7 phases in your tracker, **there is no monetization workstream at all** — no Stripe/Razorpay/LemonSqueezy, no subscriptions table, no plan/entitlement model, nothing. That's the real hole, and it's what the rest of this document addresses. I'm not re-planning your tenancy work; I'm plugging in the piece you asked me to focus on (monetization) that's genuinely missing.

---

## Blunt take

1. **Your Supabase-Auth call was already made, correctly, before I could even suggest it.** Good call. Don't let a future session talk you into replacing it with custom JWT/session handling — that would be a downgrade, not a refactor.

2. **You already paid for the "make the smart features real" decision (Phase 0: scipy/sklearn/anthropic installed).** That means my instinct to tell you to defer the optimizer/advisor honesty fix until after revenue no longer applies — you've already bought the dependencies. The remaining cost is *wiring* them (your tracker's Phase 4), which is real but smaller than the install decision was. Don't let this stall billing, though — Phase 4 (smart features) and monetization can run as parallel workstreams; neither blocks the other.

3. **The one piece of your own tracker's Phase 1 that's explicitly still open is the frontend Supabase integration** — login/session/token handling in the Next.js app. Your tracker says this literally: "Remaining (needs you): the frontend Supabase integration ... requires a real Supabase project." That is your actual next milestone, not anything I invented below. Monetization (this document) depends on that piece landing first, because you can't attach a subscription to a user who can't log in from the browser.

4. **Payment processor: your target user (per the audit) is an Indian retail investor.** Stripe supports recurring payments on Indian cards only through RBI's e-mandate/AFA flow — charges above ₹15,000 need additional authentication on every transaction, and UPI recurring is capped at ₹15,000 entirely. Razorpay is built natively for this regulation. LemonSqueezy is a Merchant-of-Record with clean global tax handling but I could not verify equivalent RBI e-mandate depth. This decision materially changes what Milestone M2 below looks like — make it before that milestone starts. (Sources: [Stripe India recurring payments docs](https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents), [Stripe RBI e-mandate FAQ](https://support.stripe.com/questions/rbi-e-mandate-regulations-faqs?locale=en-GB))

5. **Realistic pacing:** your tracker's own phase estimates aside, budget more calendar time than an engineer-week count implies. You're reviewing AI-generated diffs in a codebase you can't fully read yourself; that review loop is the actual bottleneck, not typing speed.

---

## 1. Current Tech Stack Validation (corrected against the live repo)

### Backend — as audited, still accurate
Python 3.12, FastAPI 0.115, Pydantic v2, SQLAlchemy 2 (sync), Uvicorn, pandas 2.3, numpy 1.26, yfinance 0.2.66, httpx, openpyxl.

### Backend — changed since the audit
- **Auth:** `backend/app/core/auth.py` (Supabase JWT verification) and `backend/app/models/user.py` (local `users` table, integer PK, `supabase_user_id` unique) now exist.
- **Tenancy:** `user_id` columns now present on `portfolios`, `watchlist` (with per-user unique constraint), `broker_connections`. Snapshots/history scoped transitively via `assert_portfolio_owned`, per the tracker.
- **Migrations:** Alembic is wired (`backend/alembic/versions/`) with an initial-schema migration and a tenancy migration. No longer empty.
- **Dependencies:** `scipy==1.18.0`, `scikit-learn`, `anthropic==0.117.0` are in `requirements-lock.txt`. The audit's "silently degraded fallback" finding is being actively resolved, not just documented.
- **Infra scaffolding:** `docker-compose.dev.yml` (Postgres 16 + Redis 7), `.github/workflows/ci.yml` (ruff, pytest, Alembic-on-Postgres, frontend build/type-check) both exist.

### Backend — still genuinely missing (confirmed by direct check, not by assumption)
- Frontend Supabase integration (no login/signup pages found in `frontend/src/app`, no Supabase client found in `frontend/src`).
- Billing/payments: **zero** references to Stripe, Razorpay, or LemonSqueezy anywhere in the backend.
- Redis is provisioned in `docker-compose.dev.yml` but not yet wired into the caching layer (tracker: "not multi-worker safe" still open).
- Durable background jobs — still `BackgroundTasks`, per tracker.
- Frontend tests — still zero.
- News feed and legacy upload-confirm ownership checks — tracker flags these as the two remaining backend tenancy gaps.

### Frontend — unchanged from audit
Next.js 15, React 18, TypeScript, Tailwind, Zustand, Recharts. No auth-aware routing yet.

### Database
PostgreSQL is real now (via `docker-compose.dev.yml`), not just "intended" — production hosting choice is the only thing left open (tracker: 🟡, "real prod DB pending hosting choice").

---

## 2. Monetization & Core Architecture Pre-Requisites

This section only covers what's missing: billing. Auth/tenancy architecture is not re-specified here — your `docs/hardening-tracker.md` already owns that, correctly.

### 2.1 How billing hooks into what already exists

Your `users` table already has an internal integer `id` and a `supabase_user_id`. Billing should hang off that same `id` — do **not** introduce a second identity concept (e.g. a UUID-keyed `profiles` table) just because Supabase's own tables use UUIDs. One foreign key surface, not two.

- A new `backend/app/models/billing.py` (or similar) adds `Subscription` and `Plan` models, FK'd to `users.id` (integer), matching the pattern already used by `Portfolio.user_id`.
- A new `backend/app/services/billing_service.py` handles checkout-session creation and webhook processing — this is a new, isolated service, following the same layering convention as `portfolio_manager.py` etc.
- A new `backend/app/api/v1/endpoints/billing.py` router, gated by the *same* `get_current_user` dependency already used everywhere else — no new auth pattern needed.
- Feature gating (plan limits) becomes a new FastAPI dependency, e.g. `require_plan(min_tier=...)`, composed alongside the existing `get_current_user_id` dependency on the routes that need it (upload count limits, advisor access, optimizer access).

### 2.2 Schema additions

`plans` (static reference table, editable without redeploy)
- `id` (text PK: `free` / `pro` / `premium`)
- `stripe_price_id` or `razorpay_plan_id` (text, nullable for free tier — name depends on your processor decision)
- `price_monthly_inr` (integer)
- `max_portfolios` (integer)
- `ai_advisor_enabled` (boolean)
- `optimizer_enabled` (boolean)

`subscriptions`
- `id` (integer PK, consistent with the rest of your schema — you're not using UUID PKs elsewhere)
- `user_id` (integer, FK → `users.id`)
- `plan_id` (text, FK → `plans.id`)
- `processor_subscription_id` (text, unique — Stripe/Razorpay's own ID)
- `status` (text: `trialing` / `active` / `past_due` / `canceled` / `incomplete`)
- `current_period_end` (datetime)
- `cancel_at_period_end` (boolean)
- `created_at`, `updated_at`

`users` table gets one new column: `processor_customer_id` (text, nullable) — the customer ID your payment processor assigns, so you don't have to look it up every time.

`usage_events` (optional, recommended for your own visibility into engagement before you decide plan limits) — `id`, `user_id` FK, `event_type`, `created_at`.

No changes needed to `portfolios`, `holdings`, `watchlist`, `snapshots`, `broker_connections`, or `benchmark_history` — tenancy on those is already handled by the work your tracker calls Phase 1.

---

## 3. The Monetization Milestones

These slot in alongside your existing tracker's phase numbering — think of this as **Phase M**, running in parallel with your tracker's Phases 2–5 (which are about hardening features, not billing), but gated on Phase 1 finishing first, and itself gating Phase 7 (deployment).

### Milestone M0 — Finish Phase 1 (not new work — this is the actual current blocker)
**Objective:** Frontend Supabase login/signup/session so a real logged-in user exists in the browser, not just in Postman.
**Dependencies:** None — this is your tracker's own open item.
**New & Modified Files:** New `frontend/src/lib/supabaseClient.ts`; new `frontend/src/app/(auth)/login/page.tsx` and `signup/page.tsx`; `frontend/src/services/api.ts` updated to attach the Supabase access token to outgoing requests.
**Non-Technical Verification Test:** You can sign up, log in, log out, and log back in through the actual UI, and the two isolation tests your tracker mentions still pass when you try it as two different accounts side by side.

### Milestone M1 — Payment processor decision (a decision, not code)
**Objective:** Pick Stripe, Razorpay, or LemonSqueezy with the RBI e-mandate question resolved, before any billing code is written.
**Dependencies:** M0.
**New & Modified Files:** None — this is a decision + a test-mode account signup with the chosen processor.
**Non-Technical Verification Test:** You can log into the processor's own dashboard in test mode and see your product/plan set up manually, before any code touches it.

### Milestone M2 — Plans & Subscriptions schema
**Objective:** The `plans` and `subscriptions` tables exist and are migrated, with no billing logic wired to them yet — a free-tier row can be manually inserted and read back.
**Dependencies:** M1.
**New & Modified Files:** `backend/alembic/versions/000X_billing_schema.py` (new migration), `backend/app/models/billing.py` (new).
**Non-Technical Verification Test:** Running the migration against your dev Postgres (already provisioned via `docker-compose.dev.yml`) creates both tables cleanly; you can see them in a DB browser with the expected columns.

### Milestone M3 — Checkout flow (test mode)
**Objective:** A logged-in user can go through an actual checkout in the processor's test mode, and the app records the resulting subscription.
**Dependencies:** M2.
**New & Modified Files:** `backend/app/services/billing_service.py` (new), `backend/app/api/v1/endpoints/billing.py` (new), `frontend/src/app/pricing/page.tsx` (new).
**Non-Technical Verification Test:** Using a test card / test UPI ID, you complete a checkout from the actual UI and see a new row appear in `subscriptions` with `status = active` within a few seconds.

### Milestone M4 — Webhook handling (subscription lifecycle)
**Objective:** Cancellations, renewals, and failed payments update your `subscriptions` table automatically, without you touching the database by hand.
**Dependencies:** M3.
**New & Modified Files:** Webhook route added to `backend/app/api/v1/endpoints/billing.py`; signature verification against the processor's webhook secret.
**Non-Technical Verification Test:** Cancel the test subscription from the processor's own dashboard, and confirm your app's `subscriptions` row flips to `canceled` within a minute, with no manual intervention.

### Milestone M5 — Server-side feature gating
**Objective:** Free-tier limits (portfolio count, advisor access, optimizer access) are enforced by the API itself, not just hidden in the UI.
**Dependencies:** M4.
**New & Modified Files:** New `require_plan` dependency in `backend/app/core/dependencies.py`, applied to the relevant existing endpoints (upload, advisor, optimization); `frontend/src/components/*` upgrade-prompt UI.
**Non-Technical Verification Test:** On a free test account, hit the portfolio limit and confirm a direct API call (not just the UI button) is rejected with a clear "upgrade required" response.

### Milestone M6 — Billing UI polish + account management
**Objective:** A user can see their current plan, upgrade, downgrade, and cancel from inside the app, without emailing you.
**Dependencies:** M5.
**New & Modified Files:** `frontend/src/app/billing/page.tsx` (new), backend endpoints for plan-switch/cancel requests routed through the processor's customer portal where possible (avoid building your own cancellation UI if Stripe/Razorpay offers a hosted one — less surface for you to get wrong).
**Non-Technical Verification Test:** From your own account, you can view your plan, switch tiers in test mode, and cancel — all without a database query.

**Sequencing relative to your tracker:** M0 must finish before M2 starts. M1–M6 can run alongside your tracker's Phases 2–5 (ingestion hardening, durable jobs, smart-feature wiring, feature polish) — they touch almost entirely disjoint files. Both this track and your existing Phase 5 should be done before your tracker's Phase 7 (deployment) starts, since a public launch without a way to charge people isn't really a launch.

---

## 4. Development Protocol & Next Steps

**Keep using `docs/hardening-tracker.md` as your single source of truth** for phases 0–7 — it's better than anything I'd write from scratch at this point, precisely because it's been kept current against real commits instead of a point-in-time audit. Add this document's Milestones M0–M6 to it as a new "Phase M — Monetization" section so future sessions (yours or mine) see the full picture in one place, and fix the watchlist status line while you're in there.

**One-line fix owed to your tracker right now** (do this before anything else, it costs nothing): update the Watchlist row in the feature table from "🟡 Global (unique ticker, no user)" to reflect that `user_id` + per-user uniqueness are already in the model.

**Micro-prompt for your actual next session:**

> "Per `docs/hardening-tracker.md`, Phase 1's remaining backend gaps are the news feed and legacy upload-confirm ownership checks, and the remaining frontend gap is the Supabase login/session integration. Let's do the frontend Supabase integration only: add a Supabase client, a login page, and a signup page, and wire the existing `frontend/src/services/api.ts` to attach the access token. Do not touch any backend file — `app/core/auth.py` and the tenancy scoping already work and are tested. Do not start on billing in this session."

Do not let a session jump ahead to Milestone M1+ (billing) until Phase 1 frontend auth is confirmed working end-to-end with two real test accounts.
