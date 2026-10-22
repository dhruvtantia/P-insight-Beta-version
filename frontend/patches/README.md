# braces Depth-Guard Candidate

This is a local backport, not a released or maintainer-approved upstream fix.
The repository owner approved the bounded verified-fix rule on 2026-10-21;
upstream has not approved or released this backport.

- Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- Source proposal: [micromatch/braces PR 72](https://github.com/micromatch/braces/pull/72),
  pinned commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660` (closed, not merged).
- Only the five `lib/` security changes are backported to published `braces@3.0.3`.
  The release's existing parser behavior is otherwise retained; the final newline
  in `stringify.js` is retained. No package rename or fictitious version bump.
- Original MIT license remains in the installed package; no unrelated fork or
  install script is introduced. pnpm records the patch digest in its lockfile.

The patch caps structural nesting at 100, respects stricter caller limits,
guards direct AST walkers and rejects cyclic expansion parent chains.
This addresses the tested nesting-depth behavior, not every possible regular
expression, expansion-cardinality, AST-value or resource-exhaustion problem.
Do not accept user-provided build globs, configuration or AST objects.

Run `pnpm run test:patches`, the toolchain/audit rejection tests, the full build
and type checks. Removing, changing or failing to apply the patch must not be
treated as successful remediation. Raw version-based `pnpm audit` still flags
3.0.3 even with this patch. No raw advisory is hidden. The owner-approved
`audit:dependencies` command permits only a verified local-backport result after
exact installed-byte, lock, scope, expiry and behavioural checks. Any other
finding or failed verification blocks the job. See the [dependency policy](../../docs/DEPENDENCY_POLICY.md#approved-verified-fix-rule)
and [dated review record](../security/braces-remediation.json).

Local compatibility evidence (2026-10-21): all 764 tests from the released
`3.0.3` source tag passed against both the original and installed patched code
on Node 24.19.0/macOS using a separate Mocha 11.7.5 harness. The original test
files were unchanged; relative library imports were routed to the selected
package. This one-off upstream suite is distinct from the six regression tests
committed to CI. Synthetic Tailwind/PostCSS CSS and stored-schema API generation
also matched the baseline exactly. These checks do not certify arbitrary AST
objects, regular expressions or all possible resource exhaustion.

When a supported fixed release becomes available, replace this patch in a new
reviewed PR, rerun the regression/consumer tests, and require the full audit to
pass without an exception. Do not fetch a moving Git branch during installation.
