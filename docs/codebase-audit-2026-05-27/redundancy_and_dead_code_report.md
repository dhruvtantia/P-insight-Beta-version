# Redundancy And Dead Code Report

## Deprecated Or Duplicate API Surfaces

### Legacy frontier endpoint and page

- Files:
  - `backend/app/api/v1/endpoints/frontier.py`
  - `frontend/src/app/frontier/page.tsx`
- Status: deprecated scaffold.
- Problem: real optimization lives under `/api/v1/optimization/full` and `/optimize`.
- Recommendation: remove `/frontier` from public navigation and production OpenAPI, or redirect to `/optimize`.

### Legacy analytics risk endpoint

- Files:
  - `backend/app/api/v1/endpoints/analytics.py`
  - `frontend/src/services/api.ts`
- Status: scaffold-era risk endpoint remains while quant risk lives under `/quant/full`.
- Problem: future consumers may use the wrong contract.
- Recommendation: delete or formally deprecate with no production UI consumer.

### Deprecated live indices endpoint

- Files:
  - `backend/app/api/v1/endpoints/live.py`
  - `frontend/src/services/api.ts`
- Status: deprecated in comments; `/market/overview` is canonical.
- Problem: generated types still include it, and frontend API client still exposes `liveApi.getIndices`.
- Recommendation: remove from client and production docs after confirming no consumers.

## Scaffolded Product Surfaces

### Standalone AI chat

- Files:
  - `backend/app/api/v1/endpoints/ai_chat.py`
  - `frontend/src/app/ai-chat/page.tsx`
- Problem: returns scaffold text, not a real AI workflow.
- Recommendation: remove route/page or make it an internal-only development surface.

### Broker sync

- Files:
  - `backend/app/connectors/zerodha.py`
  - `backend/app/connectors/ibkr.py`
  - `backend/app/data_providers/broker_provider.py`
  - `backend/app/services/broker_service.py`
  - `frontend/src/app/brokers/page.tsx`
- Problem: connector UI exists, but auth/sync flows are not implemented.
- Recommendation: keep contracts, but hide public route until OAuth, credentials, reconciliation, and user scoping exist.

### Screener

- File:
  - `frontend/src/app/screener/page.tsx`
- Problem: placeholder-only page with no backend.
- Recommendation: remove public route or implement real screener endpoint.

### Market beta blocks

- File:
  - `frontend/src/app/market/page.tsx`
- Problem: FX and commodities blocks are placeholders in a page that otherwise contains live data.
- Recommendation: hide or wire to real providers.

## Mock Mode Remnants

### Disabled mock provider

- Files:
  - `backend/app/data_providers/mock_provider.py`
  - `backend/mock_data/portfolio.json`
  - `backend/app/db/init_db.py`
- Current runtime: `backend/app/core/dependencies.py` rejects `mode=mock`.
- Problem: mock provider still looks like a valid implementation and generated/manual contracts still mention mock defaults.
- Recommendation: delete mock artifacts or reframe as a named, explicitly enabled `demo` mode.

### Mock source defaults in schemas and models

- Files:
  - `backend/app/models/portfolio.py`
  - `backend/app/schemas/portfolio.py`
  - `backend/app/schemas/portfolio_mgmt.py`
  - `backend/app/schemas/quant.py`
- Problem: defaults and comments still include `mock`.
- Recommendation: align defaults with real runtime values: `uploaded`, `manual`, `broker`, or `unavailable`.

### Frontend mock labels/types

- Files:
  - `frontend/src/types/index.ts`
  - `frontend/src/generated/api-types.ts`
  - `frontend/src/components/common/DataSourceBadge.tsx`
  - `frontend/src/components/portfolio/SourceBadge.tsx`
- Problem: UI and types still carry `mock` and `mock_fallback`.
- Recommendation: remove after backend schema cleanup and type regeneration.

## Duplicate Or Split Business Logic

### Advisor fallback logic

- Files:
  - `backend/app/services/ai_advisor_service.py`
  - `frontend/src/hooks/useAdvisor.ts`
  - `frontend/src/lib/advisor.ts`
- Problem: backend decides fallback state, frontend owns local rule response.
- Recommendation: move rule fallback fully to backend or version a shared fallback contract.

### Fundamentals thresholds and fallback calculations

- Files:
  - `backend/app/services/fundamentals_view_service.py`
  - `frontend/src/lib/fundamentals.ts`
- Problem: frontend has compile-time fallback thresholds that can drift from backend.
- Recommendation: backend should own thresholds; frontend fallback should be minimal loading/default UI only.

### Portfolio/risk/simulation calculations

- Files:
  - `backend/app/analytics/*`
  - `frontend/src/lib/risk.ts`
  - `frontend/src/lib/simulation.ts`
  - `frontend/src/hooks/useSimulation.ts`
- Problem: some client-side calculations are appropriate for what-if simulation, but boundaries are not fully explicit.
- Recommendation: mark simulation as non-persistent hypothetical logic; backend owns real portfolio analytics.

## Generated Contract Drift

- Files:
  - `frontend/src/generated/api-types.ts`
  - `backend/openapi.json`
- Problem: generated types include deprecated/scaffold/mock language.
- Recommendation:
  1. Remove or gate deprecated/scaffold routes.
  2. Clean backend schema defaults/descriptions.
  3. Regenerate OpenAPI and frontend types.
  4. Add a CI check that generated contracts are current.

## Operational Cleanup

### Poetry/local Python mismatch

- Problem: `python` is not on PATH and `poetry run python` currently fails with a Homebrew Python 3.14 `pyexpat` dynamic library error.
- Recommendation: document `backend/.venv/bin/python` as the reliable local runner or repair Poetry environment.

### Missing migration sources

- Problem: `backend/alembic` contains only cache artifacts in this checkout.
- Recommendation: add actual Alembic config/env/versions or remove the directory until migration support is real.

