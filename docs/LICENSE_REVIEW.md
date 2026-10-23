# Dependency License Inventory and Review

B06 acceptance and live delivery evidence belong to
[issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9).
This change validates inventories, not legal compatibility or permission to launch.
It does not assign a license to P-Insight or authorize a data-provider purchase.

## Separate Integrity From Approval

Every report says `inventoryStatus: validated` and `licenseReviewStatus: required`.
Every package record remains `reviewStatus: required`, even when metadata is a
valid SPDX expression. A successful check means the collector's environment and
coverage assertions passed. It is not a license-policy clearance, an approved
exception, a completed notice bundle or whole-B06 acceptance.

The collectors use existing pinned tools: Python's distribution metadata API,
`packaging` 26.3 for requirement/marker and SPDX parsing, pnpm 11.15.1's native
license command and the already-declared js-yaml 4.3.2 parser. No dependency version
or lock changes, custom SPDX parser, API service or app-runtime scanner are added.
See [PyPA metadata](https://packaging.python.org/en/latest/specifications/core-metadata/),
[packaging licenses](https://packaging.pypa.io/en/stable/licenses.html) and
[pnpm licenses](https://pnpm.io/cli/licenses).

## Python Collector

`scripts/license_inventory.py` runs in each existing fresh, hash-installed CI
environment: runtime, development and maintenance. Bootstrap packages are included
explicitly in each environment's selected export. The collector requires exact
installed name/version equality with the marker-evaluated generated exports;
missing, extra, duplicate or wrong-version distributions fail. It requires the
exact supported Python version and rejects empty
selected exports. Existing CI export verification still proves Poetry/export
closure; this collector does not replace that check. It records lock
and export SHA-256 values, interpreter/platform, and all locked identities. An
identity outside that environment is retained as `outside-selected-environment`,
not silently dropped. That category includes group and platform differences; it
does not mean a package is unused or approved on every platform.

Modern SPDX expressions, legacy SPDX-shaped strings, legacy prose, invalid
expressions, conflicting fields, classifier-only and missing values stay distinct.
The collector hashes installed METADATA text and legacy license text instead of copying
descriptions, authors, host paths or free-form license bodies. License-File counts
are declarations only: this collector does not open those files or assert their
contents, completeness, artifact provenance or bundled-library coverage. A valid
expression, including LicenseRef/custom, AND, OR or WITH terms, still needs review;
the collector does not select a favorable branch or normalize classifiers into
permission. Fresh environments are required; do not repair a dirty environment
by installing whichever extra versions the inventory happens to request.

From an environment already installed using [BUILD_DELIVERY.md](BUILD_DELIVERY.md):

```bash
python -m unittest discover -s scripts/tests -p test_license_inventory.py -v
python scripts/license_inventory.py --environment development --output /tmp/python-development-licenses-new.json
```

Use `runtime` or `maintenance` only in that environment's matching installation.
An all-groups maintenance workspace cannot masquerade as a runtime inventory.

## Frontend Collector

From a frozen full frontend installation with the pinned manager:

```bash
pnpm run test:licenses
pnpm run license:inventory /tmp/frontend-licenses-new.json
```

The command calls the native pnpm license listing without production-only or
optional-exclusion flags. It explicitly uses the installation's recorded v11
store location because a child pnpm command does not inherit all parent CLI
settings. Failed native commands, malformed/empty responses, unknown identities,
duplicate versions, inconsistent labels or missing installed versions fail.

Installed metadata must include runtime, dev and optional dependencies and match
the declared manager/layout. Every locked package/version must either have one
native license record or be explicitly listed as skipped by that installation.
Skipped identities must have only optional locked snapshot variants; a required
package cannot be hidden in this category. Skips remain visible with no license
claim, not treated as approved exceptions or proof of platform applicability.
pnpm's install metadata is not independent forensic evidence of a trustworthy
runner. Native grouped rows are expanded to package/version identities, rather
than undercounting multiple versions of a package name.

The report preserves declared license labels without interpreting their legal
meaning, and excludes the native command's host paths, authors and descriptions.
Only counts appear in normal logs. Source lock SHA-256 and runtime platform are
included; the report is deterministic for the same source and installed metadata,
not necessarily byte-identical between platforms or package artifacts.

## Reports and Privacy

Output paths must be new files: existing files are never overwritten. CI retains
only four explicitly named sanitized JSON inventories in two GitHub artifacts,
with a 14-day retention period and attempt-qualified names. Missing files fail;
hidden files, broad directory globs and replacement uploads are disabled. The
official upload action is pinned to the reviewed v7.0.2 commit using Node 24.
Artifacts are review evidence, not a final third-party notice bundle; retain
approved release evidence separately before ephemeral artifacts expire.

This does not upload scanner findings, raw METADATA, environment files, customer
data, database files, private diagnostics or Python license prose. Native frontend
license labels remain visible, including custom/file-reference labels. Secret-scanning
reports remain private and unuploaded under [SECRET_SCANNING.md](SECRET_SCANNING.md).
No application credentials, real customer records or old tracked runtime files
are read by these collectors.

## Remaining Approval Work

1. Reconcile supported Linux and Mac reports by lock identity, group, artifact and
   platform. Account for optional/uninstalled rows without representing a local
   machine's install as whole-lock or whole-deployment approval.
2. Verify exact artifact license texts and notices, including older/missing
   metadata, bundled native components and modified third-party code. Review
   sharp/libvips, numerical-library binaries and the local braces backport with
   their actual distribution/build scope. Metadata labels are starting evidence.
3. Separate runtime/server, browser-distributed, build/test, bootstrap/maintenance
   and deployment-image obligations. Fonts, images, datasets, service terms and
   provider/data rights are separate from Python/npm package declarations.
4. Record explicit owner/legal decisions for license choices, exceptions and
   unresolved terms; prepare and verify required notices. Do not apply a blanket
   allowlist, silently choose OR terms or add a project license automatically.
5. Add reviewed change-detection/approval gates after the inventory baseline and
   decision policy are accepted. Current integrity checks do not replace that
   outstanding approval gate. Also finish owner-admin GitHub enforcement before
   B07; no deployment, roadmap reduction or tracked-runtime cleanup follows here.
