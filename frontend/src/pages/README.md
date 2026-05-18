# Frontend Pages Skeleton

The target rebuild uses a Vite React shape with `src/pages` for route-level
screens. The current repo is still a Next.js App Router app, so active pages are
currently under `frontend/src/app`.

Use this folder when the Vite migration starts. Until then:

- Keep Next.js route files under `frontend/src/app`.
- Keep reusable UI under `frontend/src/components`.
- Keep API access under `frontend/src/services`.
- Keep query/state hooks under `frontend/src/hooks`.
- Do not place market data, broker, AI, or payment provider keys in frontend code.
- Do not duplicate backend-owned analytics calculations in frontend pages.

