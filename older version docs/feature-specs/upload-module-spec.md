# Feature Spec — Upload / Ingestion Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/upload.py`, `app/services/upload_v2_service.py`, `app/ingestion/{column_detector,normalizer,sector_enrichment}.py`.
- Frontend: `frontend/src/app/upload/`, `frontend/src/components/upload/`.

---

## Purpose

Convert a user's CSV/Excel of equity holdings into a persisted, enriched portfolio in the system, with the upload step never blocking longer than ~2s on the user's perception of "done".

## Inputs

- **Step 1 (parse):** `multipart/form-data` with `file` field (.csv | .xls | .xlsx).
- **Step 2 (confirm):** `multipart/form-data` with the same file + `column_mapping` JSON object (canonical → user column name).

## Outputs

- **`POST /upload/parse`** →
  ```json
  {
    "row_count": 23,
    "preview_rows": [{...}, ...],
    "detected_mapping": { "ticker": "Symbol", "name": "Stock Name", ... },
    "missing_optional_columns": ["sector", "purchase_date"],
    "confidence": "high|medium|low"
  }
  ```
- **`POST /upload/confirm`** →
  ```json
  {
    "portfolio_id": 17,
    "accepted": 21,
    "warnings": 1,
    "rejected": 1,
    "rejected_rows": [{...}],
    "warning_rows": [{...}],
    "enrichment_status": "pending"
  }
  ```
- **`GET /upload/status?portfolio_id=17`** →
  ```json
  {
    "portfolio_id": 17,
    "overall": "in_progress|done|failed",
    "holdings": [
      { "ticker": "TCS.NS", "sector_status": "yfinance",
        "name_status": "from_file", "fundamentals_status": "fetched",
        "enrichment_status": "enriched" },
      ...
    ]
  }
  ```

## Canonical data contract (canonical column names)

- **Required:** `ticker`, `quantity`, `average_cost`.
- **Optional:** `name`, `current_price`, `sector`, `industry`, `asset_class`, `currency`, `purchase_date` (YYYY-MM-DD), `notes`.

## Backend / frontend split

- **Backend:** column detection, row classification (accepted/warning/rejected), DB persistence in single transaction, background enrichment via `sector_enrichment.enrich_holdings()` with 5s per-ticker timeout, cache pre-warm via `pre_warm_cache()` on quant + optimizer services, restore from DB on app boot.
- **Frontend:** two-step UI (file pick → preview/mapping → confirm), polling for status, presenting rejected rows so user can edit and retry, progress affordance during enrichment.

## Non-goals

- Auto-discovery of broker (just take the file).
- Currency conversion (assume INR throughout MVP).
- De-duplication against previously uploaded portfolios.
- Multi-file batch upload.
- US/EU equity normalisation.

## Open issues

1. **Enrichment job state is not persisted.** App restart mid-enrichment leaves rows at `pending`. See refactor blueprint §3.5.
2. **No file size limit at the API layer.** Refactor blueprint §2.6.
3. **`Portfolio.is_active` toggle is implicit.** Confirm flow's effect on the active flag is undocumented. Refactor blueprint §3.2.
4. **Static sector map is hardcoded in code.** Should move to a JSON fixture.
5. **No de-dup of duplicate uploads.** Two uploads of the same file = two portfolios.
