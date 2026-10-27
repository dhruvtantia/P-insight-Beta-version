# Frontend Lint Gate

This B06 slice repairs unattended linting. It does not complete browser/state,
accessibility, identity or financial-correctness work, and does not close B06's
license-approval or repository-administration gates.

## Configuration And Scope

`pnpm run lint` runs `eslint . --max-warnings 5`, not the deprecated interactive
`next lint` command. ESLint 9 uses `frontend/eslint.config.mjs` and Next 15's
`next/core-web-vitals` preset, including React hook rules. No preset rule is
disabled or downgraded. Unused suppression comments are errors.

Next 15's preset uses the legacy configuration format, so `FlatCompat` bridges
it into ESLint's flat format. The exact already-locked `@eslint/eslintrc@3.3.5`
is now declared as a direct development tool. Plugin resolution is anchored to
the installed Next configuration instead of relying on pnpm hoisting. No locked
package/version, integrity entry or runtime dependency closure is changed.

The CLI checks application source, hand-written scripts and configuration.
Only `.next`, `next-env.d.ts` and `src/generated` are explicitly excluded as
generated outputs. TypeScript correctness remains independently checked by
`pnpm run type-check`; this slice does not enable the broader TypeScript lint
preset or claim that existing `any` usage has been eliminated.

References: [Next 15 ESLint](https://nextjs.org/docs/15/app/api-reference/config/eslint)
and [ESLint flat-config migration](https://eslint.org/docs/latest/use/configure/migration-guide).

## Visible Warning Debt

The initial ceiling is **five existing warnings**, not zero findings. The CLI
prints every warning and fails on any error or more than five warnings. It does
not identify warnings by fingerprint, so replacement of one warning by another
requires normal review. Do not raise the ceiling to pass CI; reduce it as fixes
land, with zero the target before launch.

| Existing warning | Owner / acceptance boundary |
|---|---|
| Upload confirm callback omits `setMode` | B18 upload/session workflow |
| Stock search `aria-expanded` conflicts with the implicit textbox role | B19 accessible search/combobox behavior |
| Fundamentals memo omits `COLUMNS` | B18/B19 table and threshold freshness |
| Watchlist memo omits `sortableLivePrice` | B18/B19 sorting and quote updates |
| Advisor callback omits `messages` | B18/B20 conversation context |

Those behaviors were not changed merely to silence a rule. No new suppressions
were added. Five obsolete suppression comments were removed; JSX apostrophes and
quotes were entity-escaped without changing rendered wording.

The one behavioral fix is in `TooltipHelp`: all hooks execute before the
missing-content early return. Switching between missing and present content
must not change hook order. This does not redesign tooltip accessibility.
Upload commands, backend runtime, financial algorithms, generated API schemas
and database migrations are unchanged.

## Verification And CI

Run from `frontend` with the pinned toolchain:

```bash
pnpm install --frozen-lockfile
pnpm run test:lint
pnpm run lint
pnpm run build
pnpm run type-check
```

`test:lint` exercises the real installed ESLint API/CLI: production rule/scope
checks, valid TSX, conditional-hook regression, invalid JSX, unused suppression,
visible warnings at the ceiling and rejection above it, and missing-config
failure. It is not a substitute for product component/browser acceptance.

CI runs rejection tests and lint before Build inside the existing
`Frontend (type-check + build)` job. Neither step is conditional or allowed to
continue on error. A backend build-contract test checks this wiring and check
name. Green CI is not proof that GitHub branch protection has been applied;
owner-admin readback/proof remains required in issue #9.

The October 23 audit remains an assessment of its original revision. Its score
is not automatically raised by this narrow lint improvement.

## Local Candidate Evidence (2026-10-27)

- 423 backend tests passed; 19 existing warnings retained. Ruff passed.
- All 104 frontend tooling checks passed (97 existing plus seven lint checks).
  Production build and type-check passed. Lint reports zero errors and the five
  warnings above; it is not a zero-warning result.
- An isolated Chrome/real-React fixture mounted the actual TooltipHelp source,
  substituting only its icon, CSS helper and tooltip dictionary imports. The
  baseline reproduced `Rendered more hooks than during the previous render` on
  missing-to-present content; the candidate handled missing/present/missing/
  present transitions and focus-triggered portal content without that error.
  This is bounded component evidence, not full-app browser acceptance.
- TypeScript transpilation with comments removed produced identical executable
  JS for all nine other edited application files. TooltipHelp is the only
  executable application change. The lock's package/snapshot/integrity records
  and runtime importer are identical to the base; the sole lock edit declares
  the existing FlatCompat tool directly. Fresh advisory gate returned zero
  findings; the existing braces patch/review deadline remains unchanged.

Exact-head hosted CI and PR review still determine delivery acceptance in issue
#9. Local checks do not authorize a merge, production deployment or B07 start.
