# P-Insight Full Application Audit

Generated: 2026-05-27

## Scope

This audit covers deployment readiness for public use, with emphasis on:

- live-data reliability and API failure causes
- mock, scaffold, static, and placeholder leakage
- hidden fallback behavior and data-trust risks
- redundancies, deprecated surfaces, and dead code
- production blockers across security, persistence, operations, UX, and tests

The audit is documentation-only. No application fixes were made.

## Output Files

- `deployment_readiness_score.md`: overall public-deployment score and scoring rubric.
- `severity_ordered_findings.md`: prioritized issue list from Critical through Low.
- `live_data_and_mock_usage_matrix.csv`: live/mock/static/scaffold/fallback inventory.
- `api_failure_root_cause_report.md`: endpoint-level live-data failure analysis.
- `redundancy_and_dead_code_report.md`: duplicate, stale, deprecated, and removable surfaces.
- `feature_readiness_matrix.csv`: feature-level readiness scores and deployment blockers.

## Commands Run

From repo root:

```bash
backend/.venv/bin/python -c "import sys, yfinance, httpx, pandas, numpy; print(sys.version.split()[0]); print('yfinance', yfinance.__version__); print('httpx', httpx.__version__); print('pandas', pandas.__version__); print('numpy', numpy.__version__)"
backend/.venv/bin/python -m pytest backend/tests -q
```

From `frontend/`:

```bash
npm run type-check
npm run build
```

From `backend/`, with FastAPI `TestClient`:

```bash
.venv/bin/python -c "... smoke GET /health, /readiness, /system/features, /live/status, /live/quotes, /live/fundamentals, /market/overview, /news, /watchlist, /peers, /quant/status, /optimization/status, /advisor/status ..."
```

## Verification Results

- Backend dependency import check passed:
  - Python `3.12.13`
  - `yfinance 0.2.66`
  - `httpx 0.27.2`
  - `pandas 2.3.3`
  - `numpy 1.26.4`
- Backend tests passed: `63 passed, 17 warnings`.
- Backend warnings are mostly Pydantic/FastAPI deprecations around class-based settings config and deprecated `example` metadata.
- `npm run build` passed and generated all 24 static routes.
- `npm run type-check` initially failed because `tsconfig.json` includes `.next/types/**/*.ts` entries that were missing before a build. After `npm run build`, `npm run type-check` passed.
- Local API smoke calls showed the app degrades rather than crashing for most live provider failures, but external Yahoo/NewsAPI calls failed in this sandbox with DNS resolution errors such as `Could not resolve host: guce.yahoo.com`.

## Environment Notes

- `python` is not available on PATH under the active shell; use `backend/.venv/bin/python`.
- `poetry run python` fails locally against Homebrew Python 3.14/`pyexpat`, so Poetry is not a reliable command wrapper in this environment.
- `backend/.env` exists locally and reports several API keys as configured through `/health`, but network resolution failed during smoke calls.
- `backend/alembic` contains only cache artifacts in this checkout; no real migration scripts were found by `find backend/alembic -maxdepth 3 -type f -not -name '.DS_Store'`.

## Score Summary

Overall public-deployment readiness score: **44 / 100**.

The app has a substantial working local portfolio analytics foundation, but it is not ready for public deployment because it lacks authentication, authorization, tenancy, production migration discipline, reliable external-provider isolation, complete non-mock feature boundaries, and frontend/E2E test coverage.

The most important blocker is not a single failing endpoint. It is the combination of global mutable portfolio/watchlist state, scaffolded public routes, and user-facing analytics that can degrade sharply when live providers are unavailable.

