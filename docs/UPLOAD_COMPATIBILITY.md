# Upload Command Ownership and Compatibility

Updated: 2026-10-20. B03 delivery evidence belongs to [issue #6](https://github.com/dhruvtantia/P-insight-Beta-version/issues/6). [Execution checkpoint](EXECUTION_STATUS.md) | [Full-roadmap launch gates](PRODUCTION_READINESS.md).

## Supported HTTP Contracts

All three creation routes remain supported. No route is removed, redirected or assigned a removal date by B03. Existing request/response schemas stay unchanged; a successful compatibility upload is not a claim of production readiness.

| Route | Input and response | Compatibility policy |
|---|---|---|
| `POST /api/v1/upload/v2/confirm` | File plus `column_mapping` JSON form field; `V2ConfirmResponse` includes `portfolio_id` | Preferred for new callers; used by the current upload screen |
| `POST /api/v1/upload/confirm` | File plus `column_mapping` JSON form field; legacy `ConfirmResponse` | Retained for existing mapped-upload callers; inline enrichment behavior remains |
| `POST /api/v1/portfolio/upload` | File using canonical columns; `UploadResponse` | Retained for simple-upload callers and the existing frontend API helper; not equivalent to V2 mapping/classification/enrichment |

With `AUTH_ENABLED=true`, send the access token in `Authorization: Bearer <token>`. The server resolves the account to its internal owner ID. Do not send or trust an owner ID in a filename, query parameter or form field. Missing/invalid authentication is rejected before the command runs. Existing feature switches still apply.

All supported commands pass explicit identity to `PortfolioManagerService.save_uploaded_portfolio`. A new row and its holdings belong to that owner; activation deactivates only that owner's other portfolios. Other owners and historical unowned portfolios are not reassigned or deactivated. A missing owner is rejected at the shared save boundary when authentication is enabled, before database mutations.

`AUTH_ENABLED=false` preserves existing unscoped single-user local behavior, including global activation. It is not an approved production configuration. Startup policy is tracked separately in B05; B03 does not migrate historical unowned rows.

## Client Migration Path

Existing clients need no URL, form or response-type migration for this change. They must use the authenticated account's token when authentication is enabled; they cannot choose a different owner in the payload. The shared frontend form-fetch helper already supplies the session token.

For a caller choosing to move to the preferred V2 workflow:

1. Send the file to `POST /api/v1/upload/parse`, then confirm the detected column mapping.
2. Send the file and mapping to `POST /api/v1/upload/v2/confirm` using the same signed-in account.
3. Consume `V2ConfirmResponse`, not either legacy response type. Use its returned `portfolio_id` for progress reads.
4. Poll either `GET /api/v1/upload/status?portfolio_id=...` or `GET /api/v1/upload/v2/status/{portfolio_id}` with the same account. Both enforce the B02 owner check.
5. Handle rejected rows, pending/degraded outcomes and authentication failures explicitly. Do not infer completion from HTTP success alone.

The compatibility confirmation response does not acquire a new portfolio ID field here. Do not assume V2-specific fields exist on older response types. Future route retirement needs a separate documented client migration and acceptance decision.

## Internal Python Callers

These functions require an explicit `user_id` argument:

- `confirm_legacy_upload` and `_persist_legacy_base_portfolio`.
- `confirm_upload_v2_file`, `_persist_v2_base_portfolio` and `persist_base_portfolio`.

Pass the resolved account ID by keyword. Explicit `None` is for auth-disabled local compatibility only; it is refused by the shared upload save boundary when authentication is enabled. Background jobs receive the newly created portfolio ID from these trusted creation paths, not a client-selected target ID. Their durable execution and revision fencing remain later work.

## Tools and Ownership

| Responsibility | Existing tools / module boundary |
|---|---|
| Request identity and HTTP contracts | FastAPI dependencies, Supabase JWT verification through PyJWT |
| Ownership, creation and active-portfolio updates | SQLAlchemy, scoped `PortfolioManagerService` / `PortfolioRepository` |
| Parsing and row normalization | pandas/openpyxl and existing upload services; route-specific validation differences remain |
| Regression and delivery checks | pytest with synthetic accounts/local tokens, Ruff, GitHub Actions |

UI contributors keep presentation and interaction ownership. They do not implement authoritative account selection, ownership filters or persistence rules in browser code. This change reuses the shared save boundary rather than introducing another persistence implementation.

## Acceptance Boundary

Synthetic tests cover both owners through all three routes, forged form-owner values, all nine mixed-route combinations with repeated filenames, unchanged existing holdings/other-owner portfolio state, unauthenticated requests, invalid input, explicit local compatibility and missing internal ownership context.

B03 establishes sequential database ownership/activation behavior, not a concurrent-transaction or end-to-end upload safety certificate. B04 owns private computation caches; B08-B10 own canonical contracts, PostgreSQL/concurrency and strict validation; B11 owns canonical import/refresh and private file lifecycle; B12-B14 own durable/revision-safe jobs and recovery. Different route validation, file handling and enrichment behavior are not declared unified by this change. No real-account operation, production deployment or scope reduction is approved here.
