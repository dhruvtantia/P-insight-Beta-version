# P-Insight: Execution Checkpoint

Updated: 2026-10-21. [Operating plan](EXECUTION_PLAN.md) | [Release decisions and gates](PRODUCTION_READINESS.md).

## Accepted Baseline

B00 was reviewed and accepted through [PR #3](https://github.com/dhruvtantia/P-insight-Beta-version/pull/3), merged at `9b71c53953373421bbc360244b794d8a78edc435`.

- 91 backend tests passed during final local review; Ruff and diff checks passed.
- [Exact-head CI](https://github.com/dhruvtantia/P-insight-Beta-version/actions/runs/39319125469) passed backend checks/PostgreSQL migrations and frontend build/type checking.
- [Post-merge CI](https://github.com/dhruvtantia/P-insight-Beta-version/actions/runs/39335580474) passed both jobs.
- Local main and the prior development baseline were reconciled to the accepted merge without discarding working source, unrelated local evidence or the existing locked linked worktree.

This records accepted development evidence, not production certification. The SHA is a historical acceptance anchor; always verify live GitHub/local state before starting work.

## Current Delivery Record

**B01 accepted:** [issue #4](https://github.com/dhruvtantia/P-insight-Beta-version/issues/4), [PR #11](https://github.com/dhruvtantia/P-insight-Beta-version/pull/11), merged at historical anchor `ab06e960df7ca9a6c69851e32493626df4961636`. Exact-head and post-merge CI passed, and local main/development baseline were safely reconciled. The issue owns detailed acceptance evidence.

**Later scope decision:** on 2026-10-19 the owner answered **"Full roadmap required at launch"**. [Decision #12](https://github.com/dhruvtantia/P-insight-Beta-version/issues/12) owns this follow-up's PR/CI and reconciliation evidence. B01 remains accepted; the former proposed beta scope is superseded. See the [required-feature manifest](PRODUCTION_READINESS.md#required-feature-manifest).

**B02 accepted:** [issue #5](https://github.com/dhruvtantia/P-insight-Beta-version/issues/5), [PR #14](https://github.com/dhruvtantia/P-insight-Beta-version/pull/14), historical merge anchor `8863888276d3e399c0933d3f08d0afc68b7a5673`. Exact-head and post-merge CI passed and local baselines were safely reconciled. Both progress routes pass explicit owner context into the shared status service before reading details; public response shapes are unchanged and unexpected errors are sanitized. The issue owns detailed evidence.

B02 historical isolated-source verification: 29 new synthetic access-contract cases; 50 focused upload/access/auth tests and all 120 backend tests passed. Ruff and diff checks passed. This evidence does not substitute for live service checks or the remaining security batches.

**B03 accepted:** [issue #6](https://github.com/dhruvtantia/P-insight-Beta-version/issues/6), [PR #15](https://github.com/dhruvtantia/P-insight-Beta-version/pull/15), historical merge anchor `ff3f27b2759c6a1d686c4693ee1d6ff560d7c29e`. Exact-head/post-merge CI passed and local baselines were safely reconciled. All three supported creation routes pass authenticated identity; the shared save boundary refuses missing owners when authentication is enabled. [Compatibility policy](UPLOAD_COMPATIBILITY.md) records retained contracts and limits. The issue owns detailed evidence.

B03 historical isolated-source verification: 38 new synthetic ownership cases and all 158 backend tests passed. This covers sequential database ownership/activation, not private files, concurrent constraints or durable enrichment. Explicit auth-disabled local behavior remains, not production approval.

**B04 accepted:** [issue #7](https://github.com/dhruvtantia/P-insight-Beta-version/issues/7), [PR #16](https://github.com/dhruvtantia/P-insight-Beta-version/pull/16), historical merge anchor `cfee8046532f925ed67b646e33274d733564b26e`. Exact-head/post-merge CI passed and local baselines were safely reconciled. Private optimizer/quant results use explicit owner/portfolio scope, current holding/history/benchmark inputs and calculation settings. Mutation generations fence cache publication; failures bypass storage. See the [cache contract and remaining revision gates](COMPUTATION_CACHE_CONTRACT.md). The issue owns detailed final evidence.

B04 isolated-source verification: 73 new cache/provider/HTTP cases and all 231 backend tests passed; Ruff passed. Full runtime OpenAPI is unchanged, and real optimizer/quant outputs match the accepted baseline on a fixed synthetic dataset (excluding the computation timestamp). Baseline health/readiness, unauthenticated rejection, fresh SQLite migrations and frontend type-checking passed. These do not establish production availability or general financial correctness. The revision token is an interim timestamp surrogate, not B09's required persisted revision; distributed revision/job correctness remains open.

**B05 first slice accepted:** [issue #8](https://github.com/dhruvtantia/P-insight-Beta-version/issues/8), [PR #17](https://github.com/dhruvtantia/P-insight-Beta-version/pull/17), historical merge anchor `7c7fc118d39f025518b4f24e3a78752d4c8b864a`. Exact-head/post-merge CI, including managed PostgreSQL staging startup and frontend build/type-check, passed. Local baselines were reconciled with local evidence and the locked worktree preserved. Validated settings reject incompatible staging/production configuration; managed startup checks migration stamps read-only, while disposable SQLite bootstrap requires explicit opt-in. Public health is minimal, diagnostics are local-only, and generic transport/JWT/readiness failures are sanitized. The frontend diagnostic consumer is updated. See the [runtime safety contract](RUNTIME_SAFETY.md).

**B05 second slice and whole-batch acceptance:** issue #8 owns the current delivery status, reviewed PR, exact-head/post-merge checks and reconciliation evidence. Shared approved messages cover reviewed embedded provider/job/parser error boundaries, including read-time filtering of old saved failure reasons without rewriting customer data. Column mapping has one strict structural parser across both confirms and refresh; wrong-shaped JSON becomes 422. A broker-reported sync error stops before holdings replacement. B02/B03 ownership and B04 numerical/cache behavior remain regression gates, not assumed consequences of these edits.

B05 second-slice local evidence: 78 new synthetic failure-injection cases and all 401 backend tests passed. The complete runtime schema keeps existing operation shapes/components, with only a corrected broker-sync description; real optimizer/quant outputs match the accepted baseline on a fixed synthetic dataset, excluding the computation timestamp. Review and delivery acceptance belong to issue #8: completed with that evidence means B05 is accepted and B06 is next; otherwise finish B05 first. Passing this safety batch is not production certification. Safety remains first; B25 is required before B24. Full-roadmap scope and modular UI/backend ownership are unchanged.

**B05 final delivery verified:** [PR #18](https://github.com/dhruvtantia/P-insight-Beta-version/pull/18), historical merge anchor `47867961bf56072f7dae9939614302e030d638aa`. Exact-head/post-merge checks passed, local baselines were safely reconciled, and issue #8 is closed as completed. B05 needs no repeated implementation.

**B06 first slice:** issue #9 owns current review/delivery. The [build contract](BUILD_DELIVERY.md) aligns exact runtime versions, frozen pnpm installation and pinned backend test tools, with regression checks. This slice does not close B06: backend lock consolidation/integrity, advisory/license/secret policy, actual GitHub enforcement and separate runtime-artifact review remain. Main was observed unprotected on 2026-10-20; no protection change or production deployment is implied.

**B06 first-slice delivery verified:** [PR #19](https://github.com/dhruvtantia/P-insight-Beta-version/pull/19), historical merge anchor `638c4802194e47351254a19bb8741b5c5b47b619`. Final-head/post-merge checks passed with 405 backend tests, frontend build/type checks and PostgreSQL startup. Local baselines were safely reconciled. Issue #9 remains open; owner-approved required CI without self-approval still needs administration access and effective-rule verification.

**B06 backend dependency slice:** current review/delivery acceptance belongs to issue #9. The [dependency policy](DEPENDENCY_POLICY.md) defines one Poetry graph with separate hashed app/dev/bootstrap/maintenance exports, fail-closed export/advisory checks and dated scan limits. Numerical packages are retained; compatible framework/security updates include explicitly reviewed OpenAPI metadata differences. This does not certify financial correctness or complete B08's generated-artifact reconciliation. Finish this slice's delivery, then frontend advisory/license/secret policy, GitHub enforcement and separate runtime-artifact review before B07.

**B06 backend slice accepted:** [PR #20](https://github.com/dhruvtantia/P-insight-Beta-version/pull/20), historical merge anchor `996327043043018593302e0f102d03ed7b70c8c7`. Exact-head/post-merge Linux checks passed, including all 418 tests, isolated runtime/dev/maintenance installs, backend advisory/export checks and PostgreSQL startup. Local baselines were reconciled with all preserved evidence/worktree entries unchanged. Issue #9 owns full delivery evidence; the old local Python environment was not upgraded.

**B06 frontend dependency slice in progress, not accepted:** the candidate updates the patched Next.js 15 maintenance line and affected transitives, with a full frontend advisory gate and real synthetic-registry rejection tests. The remaining build-only `braces` advisory has no published patched version. The owner requested investigation of a real fix rather than an exception; a pinned upstream-derived local depth-guard candidate and negative-control/consumer tests are included for review, but the raw version-based gate remains red. No ignored ID, vulnerability exception, merge, deployment or B07 acceptance is implied. See the [frontend policy and unresolved gate](DEPENDENCY_POLICY.md#frontend-review-and-gate). Keep the candidate unmerged while that gate is red. Issue #9 owns exact-head CI/review and the next resolution decision.

## Near-Term Queue

| Order | Batch / delivery issue | Acceptance focus |
|---|---|---|
| 1 | [B06: reproducible builds and checks](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9) | Resolve frontend advisory gate; finish license/secret policy, enforcement and runtime-artifact review |
| 2 | [B07: identity lifecycle and access matrix](https://github.com/dhruvtantia/P-insight-Beta-version/issues/10) | After whole-batch B06 acceptance: signing/claim/provisioning and private-operation contracts |

Issues contain desired acceptance, not proof of completion. Do not infer that an open issue was tested or fixed. Later B08-B25 batches are defined in the operating plan and receive delivery issues as they approach execution.

## Milestone Evidence

| Milestone | Current evidence / gate |
|---|---|
| M0 baseline/tracking | B00 accepted; B01 publication acceptance is recorded in issue #4 |
| M1 safe foundation | B02-B05 accepted; B06/B07 remain. These bounded slices do not establish full private-operation isolation |
| M2 data contracts | B08/B09 ownership/revision/API/database gates remain |
| M3 import/enrichment | B10-B14 durable lifecycle and recovery gates remain |
| M4 financial correctness | B15-B17 provider/quality/numerical acceptance remains |
| M5 browser experience | B18-B20 session, UI and integration acceptance remains |
| M6 operations | B21-B23 deploy/email/alerts/restore/customer/capacity gates remain |
| M7 full-roadmap launch | B25 required-feature acceptance must precede B24 full-product rehearsal and launch decision; both remain |

## Scope and Open Decisions

| Decision | State | Before it is needed |
|---|---|---|
| First-launch feature breadth | APPROVED: full roadmap, including public signup and required integrations; decision #12 | Fulfill manifest before B24; no silent deferrals |
| Markets/assets/currencies and real-time/advanced specifications | OPEN; includes defining README US expansion and real-time analytics promises | Instrument/feed/methodology contracts and full-scope estimate |
| AI/news/events/billing/brokers/screener implementation choices | OPEN; inclusion is required, provider/pricing/permissions details are not selected | Affected specification, integration or purchase |
| Data contracts/rights, region and budget | OPEN | Production provider/hosting commitment |
| Retention, export/delete, support and disclosures | OPEN | Customer lifecycle and release acceptance |
| Required-check/review enforcement and deployment linkage | VERIFY in B06/B21 | Relying on server enforcement or production promotion |

Open specification and commercial decisions do not prevent the next code-only safety batch. Required features with unresolved specifications remain launch blockers, not exclusions. Scope approval is not vendor-purchase or go-live approval. Re-estimate the full roadmap after specification and provider eligibility; do not reuse a beta-only delivery estimate.

## Delivery Evidence Required Each Time

Record in the linked issue: selected batch/slice; allowed ownership surface; actual base/head; tests and environment; review findings; PR URL and exact-head checks; final merge/post-merge checks; safe local reconciliation; remaining dependencies; next action. Sanitize all public evidence.

GitHub Issues own live delivery state. The checkpoint owns the durable navigation and accepted evidence anchors. A merged PR is not a production deployment, and CODEOWNERS is not proof that branch protection is configured.

## Next Session

Read B06 issue #9 and scope decision #12, then verify live GitHub/local main and the frontend candidate PR. B05 and the B06 build/backend slices are accepted. Resolve the frontend advisory without silently ignoring it, then finish the remaining gates in BUILD_DELIVERY.md before B07. Implement only the selected slice with synthetic tests, review and exact-revision checks. Preserve local audit evidence and linked worktrees. Do not start a broad import rewrite. Required roadmap integration and private-staging preparation can be planned alongside the safety work without bypassing its contracts or changing full-roadmap public-launch scope. Revisit the B04 revision hook when B09 lands.
