# Committed-History Secret Checks

B06 delivery and acceptance belong to [issue #9](https://github.com/dhruvtantia/P-insight-Beta-version/issues/9).
This is not deployment approval or a whole-project security certificate.

## Tool and Scope

The [standard-library installer/wrapper](../scripts/security_checks.py) uses
[Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), with
reviewed SHA-256 digests for official Linux x64 and macOS ARM64 archives. It
extracts only the regular executable entry after verification. Unsupported
platforms and existing destination directories fail. The hash pins reviewed bytes;
it is not an independent publisher signature or compromised-runner defense.
Gitleaks is feature-complete and receives security patches, according to its
[maintainer](https://github.com/gitleaks/gitleaks#readme). Reassess support and
security when updating; never fetch a floating latest version during a build.

The scanner runs locally and needs no paid account, organization action license,
production credential or upload to a scanning service. Download needs GitHub
access. No scanner package is installed into the application environment.

The existing `Backend (ruff + pytest + alembic)` job checks out full history,
installs the pinned disposable tool, runs synthetic rejection tests, then scans
all commits reachable from checked-out `HEAD`. Separate merge-parent diffs cover
merge-resolution-only additions. Existing backend install/audit/test/migration
steps run afterward. The frontend job and both required-check names are retained.

## Failure and Privacy Rules

- Use exactly the versioned configuration extending default rules. No baseline,
  custom exclusion, path-filter bypass or failure fallback is authorized.
- Remove scanner environment configuration overrides, ignore inline
  `gitleaks:allow` comments, and reject a source `.gitleaksignore`, including a
  symlink. Gitleaks otherwise loads that file independently of its ignore flag.
- Reject changed/empty configuration, shallow history, missing/wrong scanner,
  timeout, malformed/inconsistent reports, process errors and detected findings.
- Print only rule counts, scanned revision and reachable commit count. Capture
  scanner stdout/stderr and JSON privately; never echo raw records or publish
  reports as Actions artifacts. Reports also request 100% redaction. The private
  temporary report directory is removed when the wrapper ends.

## Local Use

Use the exact Python version in `.python-version` and a new empty tool path:

```bash
python scripts/security_checks.py install --destination /tmp/pinsight-secret-tools-new
PINSIGHT_TEST_SCANNER=/tmp/pinsight-secret-tools-new/gitleaks python -m unittest discover -s scripts/tests -p test_security_checks.py -v
python scripts/security_checks.py scan --scanner /tmp/pinsight-secret-tools-new/gitleaks
```

`install --archive` supports offline archives, with the same pinned digest.
There is no scan success/ignore override. Commit the candidate before scanning:
staged-only, unstaged and untracked files are not scanned. Local `.env`, customer
uploads, databases and ignored audit evidence are deliberately not read; any such
content committed in reachable history is scanned. Never use real keys as fixtures.

## Incident Procedure

1. Stop delivery. Investigate in a private isolated checkout; any native-scanner
   diagnostic report belongs outside the repository with owner-only access.
   Do not paste credentials or raw findings into chats, public logs, issues or PRs.
2. Treat a possibly real exposed credential as compromised. The owner must revoke
   or rotate it at the issuing service, review service access/audit logs, update
   dependents and verify the replacement. Never use a discovered key to identify
   its account; scanning does not validate keys online.
3. Fix the source and prevent recurrence. A deleted current line remains in
   history; the deleted-key test must still fail. Record a private incident and
   only a public-safe status. Exact false-positive handling needs separate review;
   no blanket baseline/path exception is approved.
4. Coordinate any credential action, history rewrite or force push separately
   with the owner. Do not automatically rewrite history or delete local evidence.

## Limits

This is pattern-based detection, not proof that no secret exists. Default upstream
allowlists and coverage remain part of the pinned tool. Binary content, archives
(archive traversal disabled), content beyond two decode levels, unreachable/deleted
refs, other remote branches, service dashboards/CI secret stores, customer storage
and uncommitted files are not covered. The commit count does not mean every byte
was detectable. No complete forensic or all-remote-branches scan is claimed.

GitHub-native secret scanning/push protection and main required-check enforcement
are separate owner-administration settings, not enabled by this change. Passing
CI or installing a local hook does not force other contributors to use it. Main
protection still needs setup/readback/negative-check proof without sole-maintainer
self-approval deadlock. License review and tracked-runtime disposition remain
separate B06 gates before B07.
