# Backend Module Contracts

Date: 2026-04-25

This guide documents the backend module boundaries that are currently implemented. P-Insight remains a modular monolith: modules share one FastAPI app and one database, but each feature should be edited through its service boundary instead of reaching across folders for internal state.

## Contract Rules

- Keep public API response shapes stable unless a change intentionally updates the frontend and tests in the same commit.
- Prefer service boundaries over route-level business logic.
- Use backend contract tests for endpoint shape, state enums, and degraded responses.
- Keep side effects coordinated in workflow services rather than spread across endpoint code.
- Treat process-local caches as implementation details behind wrapper services.
- Do not add new direct consumers of raw module-level dictionaries or duplicate portfolio aggregation math.

## Portfolio Read Boundary

Owner files:

- `backend/app/services/portfolio_service.py`
- `backend/app/api/v1/endpoints/portfolio.py`
- `backend/app/services/context_builder.py`

Primary service:

- `PortfolioReadService`

Inputs:

- SQLAlchemy session
- `portfolio_id` or active/default portfolio selection
- Holding rows from the database

Outputs:

- Active/default portfolio identity
- Portfolio holdings
- Enriched holding metrics
- Portfolio summary
- Sector allocation
- Concentration risk snapshot

Safe edit rule:

If dashboard, holdings, risk, or advisor need portfolio totals, weights, sector allocation, or concentration risk, update `PortfolioReadService` first and consume the result from there. Avoid recalculating those values independently in route handlers or advisor code.

Tests:

- `backend/tests/test_portfolio_contracts.py`
- `backend/tests/test_portfolio_read_boundary.py`
- `backend/tests/test_advisor_boundaries.py`

## Upload And Post-Upload Workflow

Owner files:

- `backend/app/api/v1/endpoints/upload.py`
- `backend/app/services/isolated_upload_module.py`
- `backend/app/services/upload_v2_service.py`
- `backend/app/services/post_upload_workflow.py`

Primary boundary:

- `IsolatedUploadModule`
- `UploadParseRequest` / `UploadParseResult`
- `UploadConfirmRequest` / `UploadConfirmResult`
- `UploadValidationResult`
- `UploadEnrichmentJob`
- `UploadModuleStatus`
- `UploadCompleted`
- `PostUploadWorkflow`

Inputs:

- uploaded CSV/XLS/XLSX file path
- confirmed canonical column mapping
- `portfolio_id`
- accepted holdings
- source filename
- `source="uploaded"`

Outputs and side effects:

- parse result with detected mapping and preview rows
- validation result with accepted, rejected, and warning rows
- persisted base portfolio compatible with V2
- Uploaded holdings memory cache update
- Canonical uploaded CSV write
- Background enrichment scheduling
- Quant/history work remains triggered through the existing enrichment path

Safe edit rule:

The current public V2 upload routes remain the production path. `IsolatedUploadModule` is a parallel internal candidate that must be tested against V2 before it replaces anything. Upload endpoints should validate and persist the base portfolio, then hand a single `UploadCompleted` payload to `PostUploadWorkflow`. New post-upload side effects should be added inside the workflow, not scattered into the route handler.

Replacement gate:

1. Golden comparison tests prove the isolated module matches V2 row classification and core holding output.
2. Existing V2 route tests still pass.
3. Provider failures are represented as explicit status/failure metadata.
4. Manual upload smoke tests pass across dashboard, holdings, risk, changes, peers, and advisor.
5. Only then should a public `/upload/v3` route or V2 replacement be considered.

Tests:

- `backend/tests/test_upload_contracts.py`
- `backend/tests/test_isolated_upload_module.py`

## History Contract

Owner files:

- `backend/app/api/v1/endpoints/history.py`
- `backend/app/services/history_service.py`
- `frontend/src/hooks/usePortfolioHistory.ts`

Canonical frontend-facing states:

- `building`
- `complete`
- `failed`
- `not_started`

Internal/legacy build labels:

- `pending`
- `done`
- `unknown`

Safe edit rule:

Canonical endpoints under `/api/v1/history/{portfolio_id}/...` must not leak internal labels through `status`, `state`, or `build_status`. Use the resolver helpers in `history.py` whenever build status is exposed to the frontend. Legacy `/portfolios/{id}/history...` endpoints remain for compatibility.

Tests:

- `backend/tests/test_history_contracts.py`

## Cache And Status State

Owner files:

- `backend/app/services/cache_service.py`
- `backend/app/analytics/quant_service.py`
- `backend/app/services/history_service.py`

Primary services:

- `TimedMemoryCache`
- `HistoryBuildStatusStore`

Inputs:

- cache key and computed payload
- portfolio history status updates

Outputs:

- cached payloads with age metadata where needed
- build status dictionaries compatible with existing endpoints

Safe edit rule:

Do not access raw cache dictionaries from new code. Quant cache behavior and history build status should go through the wrappers so a future persistent cache/status store can replace them with a small local change.

Tests:

- `backend/tests/test_cache_services.py`

## Snapshot Read Boundary

Owner files:

- `backend/app/services/snapshot_service.py`
- `backend/app/services/context_builder.py`

Primary service:

- `SnapshotReadService`

Inputs:

- SQLAlchemy session
- `portfolio_id`
- result limit

Outputs:

- recent snapshot briefs
- recent snapshot change summary

Safe edit rule:

Advisor/context consumers should not query `Snapshot` rows directly. Snapshot history and recent-change summaries should be read through `SnapshotReadService`; snapshot creation and delta APIs remain owned by `SnapshotService`.

Tests:

- `backend/tests/test_advisor_boundaries.py`

## Advisor Boundary

Owner files:

- `backend/app/services/ai_advisor_service.py`
- `backend/app/services/context_builder.py`
- `backend/app/services/portfolio_service.py`
- `backend/app/services/snapshot_service.py`

Primary flow:

1. Resolve explicit or default portfolio through `PortfolioReadService`.
2. Build context through `PortfolioContextBuilder`.
3. `PortfolioContextBuilder` consumes portfolio and snapshot read services.
4. Provider orchestration and fallback behavior remain inside `AIAdvisorService`.

Safe edit rule:

Advisor code should orchestrate context and provider calls. It should not own portfolio aggregation, snapshot history logic, or raw database calculations that belong to portfolio/snapshot services.

Tests:

- `backend/tests/test_advisor_boundaries.py`

## Contract Test Commands

```bash
cd backend
poetry run pytest
poetry run python -m compileall app

cd ../frontend
pnpm type-check
```

## Safe Module Change Checklist

1. Identify the owning service and endpoint before editing.
2. Update the service boundary first.
3. Keep endpoint response shape stable or update frontend types in the same change.
4. Add or update a contract test for the changed shape/state/side effect.
5. Run backend tests, backend compile, and frontend type-check.
6. Manually smoke test the related page.
