# Python License Artifact Review: First Pass

## Decision And Scope

**Evidence gathered; release approval still required.** This review narrows the
26 unclear/missing Python metadata cases identified in B06. It does not clear all
126 Python identities, 476 frontend identities, a deployment image or market-data
rights. No license branch, exception, product license or commercial entitlement
has been selected on the owner's behalf. No app behavior or dependency changes.

Source baseline: `a9c1f0199dbc83a3598d5acb55d9edacb78c0607`.
Poetry lock SHA-256: `cf96486f569970493050870c68fcd00dfe78a64311e8ff5b5868fc606a0f7b30`.
Delivery status belongs to [B06 issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9),
not an implied green license-approval checkbox.

The [machine-readable record](license-evidence/python-artifacts-2026-10-27.json)
retains exact artifact names, public registry URLs, locked SHA-256 values, groups,
license-file candidate paths/sizes/hashes and review-required status. It contains
no installed-machine paths, account data, raw package metadata or license prose.
Archive hashes establish equality with the existing lock, not independent
publisher authentication or a forensic supply-chain attestation.

## Method And Coverage

1. Rechecked the isolated Mac all-groups Python environment: 121 installed
   identities exactly match the marker-evaluated hashed bootstrap/dev/maintenance
   exports. This is a review workspace, not a runtime-only deployment image.
2. Used the existing `packaging` SPDX parser to select the 17 legacy-prose,
   eight classifier-only and one missing-license cases. A valid parser result
   for the other 95 is not approval of those packages.
3. Downloaded the exact 26 source archives from public PyPI, checked each name,
   version, filename and SHA-256 against the committed Poetry lock, and inspected
   the top-level license texts. No setup script, package import, build or install
   was executed. Source license evidence is not wheel-completeness evidence.
4. Inspected seven additional locked wheel samples: Linux x86_64 NumPy, SciPy,
   pandas, protobuf, psycopg2-binary and uvloop, plus frozendict's universal wheel.
   These are explicit review samples, not proof of the future production
   resolver's artifact selection. No CPython 3.12 Linux native frozendict wheel
   was substituted or invented; the universal wheel is explicitly identified.
5. Recorded **33 archives / 111 filename-based license candidates**. That count
   includes some documentation wrappers and repeated texts; it is not 111
   independent legal licenses or proof every embedded notice was found. One
   non-license changelog symlink is recorded without following it. License
   symlinks, unsafe names, duplicate file paths and special files fail inspection.

Five locked identities remain outside the Mac environment: colorama 0.4.6,
greenlet 3.3.2, jeepney 0.9.0, pywin32-ctypes 0.2.3 and secretstorage 3.5.0.
They remain explicit coverage gaps, not approved exclusions. Python/environment,
deployment architecture and artifact differences must be reconciled separately.

## The 26 Unclear Metadata Cases

These are observations from the pinned source archive, **not substituted SPDX
metadata, legal advice or launch approval**. The existing inventory's original
metadata classification is preserved. All rows remain review-required. Group
membership is recorded in JSON; it is not evidence that every group ships.

| Exact package | Text observed / additional review |
|---|---|
| annotated-types 0.7.0 | MIT text with contributor copyright; preserve both. |
| beautifulsoup4 4.14.3 | MIT plus html5lib/soupsieve attribution in the same file. Do not retain only its first paragraph. |
| defusedxml 0.7.1 | PSF license version 2 text; retain its notice and review modification terms if applicable. |
| distro 1.9.0 | Apache 2.0 text. Review any separately embedded notices before distribution. |
| frozendict 2.4.7 | LGPL version 3 text in source and universal wheel; not MIT merely because some neighboring packages are MIT. Distribution/source/relinking scope and incorporated GPL text require explicit review. |
| installer 0.7.0 | MIT text; docs/license.md is an include wrapper, not an additional independent license. |
| jaraco.classes 3.4.0 | MIT permission/disclaimer text without an explicit copyright line in that file; reconcile attribution from the exact package source. |
| markdown-it-py 4.0.0 | Separate MIT LICENSE and LICENSE.markdown-it copyright holders. Preserve both. |
| mdurl 0.1.2 | Multiple MIT copyright/permission blocks; preserve the whole file. |
| multitasking 0.0.12 | Apache 2.0 text. No permission to redistribute downloaded market data follows. |
| pandas 2.3.3 | Source root is BSD 3-clause; numerous component files and a much larger consolidated wheel notice remain relevant. Root text alone is insufficient. |
| peewee 4.0.4 | MIT permission/disclaimer and copyright found despite missing license-value metadata. The inventory remains missing-metadata, not rewritten as automatic approval. |
| pip_api 0.0.35 | Apache 2.0 root; vendored packaging code also contains embedded MIT attribution. Filename discovery does not find all embedded code-header notices. |
| pip_audit 2.10.1 | Apache 2.0 text; maintenance-tool scope still needs separation from shipped runtime. |
| protobuf 7.34.1 | BSD 3-clause style text and generated-code ownership note; source and sampled wheel texts match. Not a blanket assertion about every bundled component. |
| psycopg2-binary 2.9.12 | LGPL 3-or-later statement, OpenSSL linking exception and separate permissive callback-code terms. Source has COPYING.LESSER; wheel's single discovered notice is not a native-library clearance. |
| python-dateutil 2.9.0.post0 | Apache applies to specified newer/relicensed contributions; BSD applies to all code according to the same file. Do not automatically turn this into an unqualified preferred OR choice. |
| python-discovery 1.6.4 | MIT permission/disclaimer text without an explicit copyright line in that file; attribution reconciliation remains. |
| requests-toolbelt 1.0.0 | Short Apache 2.0 reference, not a complete copy of its terms. Notice bundle must account for that. |
| scipy 1.18.0 | BSD 3-clause root plus component notices. Sampled Linux wheel also carries native OpenBLAS/GCC-runtime/libquadmath terms. |
| shellingham 1.5.4 | ISC-style permission/disclaimer text and copyright. Original legacy metadata is retained as evidence. |
| sortedcontainers 2.4.0 | Short Apache 2.0 reference with copyright; same full-text/notice review boundary as requests-toolbelt. |
| tomli_w 1.2.0 | MIT text with copyright. |
| trove-classifiers 2026.9.21.13 | Apache 2.0 text. Build/maintenance scope remains explicit. |
| uvloop 0.22.1 | MIT and Apache texts plus vendored libuv MIT/BSD/ISC attributions; libuv docs have separate CC-BY-4.0 text. No license choice or documentation-distribution scope inferred. |
| yfinance 0.2.66 | Apache 2.0 software text; this is not Yahoo data permission. Data-provider rights remain a separate B15 gate. |

## Native And Notice Findings

### N1: Numerical Wheels Contain More Than A Package-Level BSD Label

The locked NumPy wheel contains three files under `numpy.libs`: OpenBLAS,
libgfortran and libquadmath. Its main license file includes associated notices,
GPL-with-GCC-runtime-exception terms and LGPL-2.1-or-later text, plus numerous
component notices elsewhere. The sampled SciPy wheel contains five files under
`scipy.libs` (including two libgfortran and two libquadmath filename variants);
its main notice likewise includes bundled-library terms.

This is evidence of additional obligations to review, not evidence that the app
must be open-sourced or that these libraries are incompatible. Keep the full
applicable texts/exceptions and review actual linking/distribution/build scope.
Do not reduce either wheel to one BSD label or remove working numerical packages
as a side effect of this investigation. Source-root and wheel notices differ.

### N2: psycopg2-binary's Wheel Needs A Separate Native-Library Review

The sampled wheel has **15 bundled shared libraries** under `psycopg2_binary.libs`,
including libpq, libssl/libcrypto, Kerberos, LDAP/SASL and other libraries. The
filename discovery finds one package license file, not 15 complete corresponding
component notice/source records. Their absence as separate matching filenames
does not prove notices cannot exist in code headers or other locations, but it
does mean this review cannot clear those binaries.

Upstream also [recommends a source-built production installation](https://www.psycopg.org/docs/install.html#binary-install-from-pypi)
and explains that binary wheels carry their own libraries with independent
updates and possible SSL conflicts. This is a **production packaging decision**,
not an authorization to replace the driver now. First choose and document the
deployment image, supported libraries, update ownership and build contract; then
test migrations/startup/concurrency and license evidence on that exact image.

### N3: uvloop Source And Wheel Discovery Do Not Cover The Same Notices

The source archive contains five discovered license files, including
`vendor/libuv/LICENSE`, `LICENSE-extra` and `LICENSE-docs`. The wheel sample has
only uvloop's two top-level license files under its metadata license directory.
Reconcile the libuv attribution/embedded-code scope before preparing the final
bundle. Do not infer absence of vendored code from a two-file license listing,
or infer that source documentation ships to users just because it is in a tarball.

### N4: Embedded Notices Need More Than Filename Matching

The first discovery pass mistook `pip_api/_vendor/packaging/licenses/*.py` for
license documents. The tool now excludes ordinary lowercase code-module
directories while recognizing conventional license basenames, uppercase SPDX
`LICENSES` trees and `.dist-info/licenses`. A regression covers that case.
The embedded MIT header remains a **manual review finding**, not silently cleared
by that narrower discovery. Likewise, documentation wrappers and repeated texts
are candidates to inspect, not separate license counts.

The tool does not parse every source-code header, dynamically inspect binary
linking, identify license text from bytes, resolve SPDX choices or certify
completeness. A missing matching filename remains explicit in reports. No
positive package allowlist or approval gate is introduced by this first pass.

## Reproducing An Artifact Record

Download the exact `registryUrl` and retain its exact filename from the JSON,
outside source control. Use the existing pinned, hash-installed Python tool
environment, from the repository root:

```bash
python scripts/license_artifact_evidence.py \
  --lock backend/poetry.lock --name peewee --version 4.0.4 \
  --artifact /tmp/peewee-4.0.4.tar.gz --output /tmp/peewee-evidence-new.json
python -m unittest discover -s scripts/tests -p 'test_license*.py' -v
```

The inspector has no network, subprocess, build, import-of-package or extraction
operation. It requires exact lock filename/identity/hash equality before reading
members, checks bounded archive/member/text/expanded sizes, and never overwrites
an existing output. It records non-license links without resolving targets;
linked license candidates and unsafe/special members fail. Archive/member bytes
are untrusted input, not instructions. No broad directory upload is configured.

Synthetic rejection tests run with existing inventory tests in the existing
backend CI job. Recorded-evidence tests verify exact source lock/file hashes,
required review status and coverage distinctions. They cannot re-prove remote
artifact availability, manually reviewed text meanings or deployment selection.
To reproduce byte-level findings, inspect the same locked archives separately.

Technical references: [installed metadata](https://packaging.python.org/en/latest/specifications/recording-installed-packages/),
[wheel format](https://packaging.python.org/en/latest/specifications/binary-distribution-format/)
and [license-expression grammar](https://packaging.python.org/en/latest/specifications/license-expression/).
Distribution questions require the applicable complete texts and an explicit
owner/legal decision; for example, [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
contains more than its one-line label. The [pinned yfinance README](https://raw.githubusercontent.com/ranaroussi/yfinance/0.2.66/README.md)
separately warns about Yahoo data use; package licensing is not data licensing.

## Next Actions, In Order

1. Review/deliver this bounded evidence/tooling change independently of the lint
   candidate. Keep B06 open; this first pass does not approve packages or launch.
2. Specify the actual deployment/build/browser-distribution artifacts and image
   architecture. Reconcile their selected Python artifacts with this source and
   sample evidence, including the five outside-Mac identities and the remaining
   95 installed identities. Do not build a permanent notice bundle for an
   invented target or treat a sample as a production resolution result.
3. Resolve N1-N4 through exact component/source/notice evidence and documented
   distribution scope. Record owner/legal decisions where terms/choices or
   native packaging need judgment. Do not assume all LGPL packages are banned,
   all SaaS use is exempt, or every dual-license choice is already approved.
4. Review all frontend artifacts, sharp/libvips and other native components,
   braces patch provenance, fonts/assets and deployment OS/tooling. Existing
   Linux/Mac inventory coverage is a starting point, not that completed review.
5. Assemble actual required license/attribution/exception/modification notices
   for those artifacts; verify retained bytes, included component coverage,
   distribution placement and a separately approved change-detection policy.
   A hashes-only manifest is **not** the notice bundle.
6. Finish the separately approved owner-admin main protection/readback and
   failing/passing-PR proof. Complete remaining whole-B06 gates before B07.
   Market-data entitlements remain independently required for public launch.
