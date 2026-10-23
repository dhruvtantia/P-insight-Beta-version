"""Install an integrity-pinned scanner and scan committed history without public findings."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import urllib.request

VERSION = "8.30.1"
# Official release-asset SHA-256 digests, reviewed 2026-10-22.
ASSETS = {
    ("Darwin", "arm64"): ("darwin_arm64", "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"),
    ("Linux", "x86_64"): ("linux_x64", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"),
}
ROOT = Path(__file__).resolve().parents[1]


def checked(command, **kwargs):
    result = subprocess.run(command, capture_output=True, timeout=600, **kwargs)
    if result.returncode:
        raise ValueError("Command failed; output withheld to protect possible secrets")
    return result.stdout


def install(destination, archive=None):
    if destination.exists() or destination.is_symlink():
        raise FileExistsError("Choose a new empty tool directory")
    asset, digest = ASSETS[(platform.system(), platform.machine())]
    if archive:
        data = archive.read_bytes()
    else:
        url = (f"https://github.com/gitleaks/gitleaks/releases/download/v{VERSION}/"
               f"gitleaks_{VERSION}_{asset}.tar.gz")
        with urllib.request.urlopen(url, timeout=60) as response:
            if not response.geturl().startswith("https://"):
                raise ValueError("Insecure download redirect")
            data = response.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Scanner archive integrity mismatch")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as package:
        member = package.getmember("gitleaks")
        if not member.isfile() or member.size > 64 * 1024 * 1024:
            raise ValueError("Invalid scanner archive entry")
        binary = package.extractfile(member).read()
    destination.mkdir(parents=True, exist_ok=False)
    executable = destination / "gitleaks"
    executable.write_bytes(binary)
    executable.chmod(0o700)
    if checked([str(executable), "version"]).decode().strip() != VERSION:
        raise ValueError("Scanner version mismatch")
    print(json.dumps({"status": "installed", "version": VERSION, "archiveSha256": digest}))


def scan(executable, repository=ROOT, config=ROOT / ".gitleaks.toml"):
    # Gitleaks also loads source/.gitleaksignore independently of its ignore flag.
    ignore_file = repository / ".gitleaksignore"
    if ignore_file.exists() or ignore_file.is_symlink():
        raise ValueError("Repository fingerprint suppression is not permitted")
    if tomllib.loads(config.read_text()) != {
        "title": "P-Insight committed-history secret checks", "extend": {"useDefault": True},
    }:
        raise ValueError("Unreviewed scanner configuration")
    if checked([str(executable), "version"]).decode().strip() != VERSION:
        raise ValueError("Scanner version mismatch")
    if checked(["git", "rev-parse", "--is-shallow-repository"], cwd=repository).strip() != b"false":
        raise ValueError("Full committed history is required; shallow checkout rejected")
    head = checked(["git", "rev-parse", "HEAD"], cwd=repository).decode().strip()
    commits = int(checked(["git", "rev-list", "--count", "HEAD"], cwd=repository))
    if not commits:
        raise ValueError("Empty history cannot pass")
    # No scanner logs or report values are forwarded into public CI logs.
    with tempfile.TemporaryDirectory(prefix="pinsight-secret-scan-") as directory:
        private = Path(directory)
        report = private / "findings.json"
        ignore = private / "empty-ignore"
        ignore.touch(mode=0o600)
        env = {key: value for key, value in os.environ.items()
               if not key.startswith("GITLEAKS_")}
        result = subprocess.run([
            str(executable), "git", str(repository), "--config", str(config),
            "--log-opts=--full-history --diff-merges=separate --no-ext-diff --no-textconv HEAD",
            "--platform=none", "--redact=100", "--no-banner", "--no-color",
            "--ignore-gitleaks-allow", "--gitleaks-ignore-path", str(ignore),
            "--max-decode-depth=2", "--max-archive-depth=0", "--timeout=300",
            "--exit-code=42", "--report-format=json", "--report-path", str(report),
        ], cwd=private, env=env, capture_output=True, timeout=330)
        findings = json.loads(report.read_text())
        if not isinstance(findings, list):
            raise ValueError("Malformed scanner report")
        # Errors, inconsistent reports and unknown outcomes must not become green.
        if result.returncode not in (0, 42) or (result.returncode == 0) != (len(findings) == 0):
            raise ValueError("Scanner failed or returned an inconsistent result")
        if any(not isinstance(item, dict) or not isinstance(item.get("RuleID"), str)
               for item in findings):
            raise ValueError("Malformed scanner finding")
        rules = {}
        for finding in findings:
            rule = finding["RuleID"]
            # Only counts leave the private temporary directory, never paths or matches.
            rules[rule] = rules.get(rule, 0) + 1
        summary = {"status": "findings" if findings else "passed", "scanner": f"gitleaks@{VERSION}",
                   "head": head, "commits": commits, "findings": len(findings), "rules": rules}
        print(json.dumps(summary, sort_keys=True))
        return 1 if findings else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("install")
    setup.add_argument("--destination", type=Path, required=True)
    setup.add_argument("--archive", type=Path, help="Optional offline archive; same pinned digest required")
    audit = commands.add_parser("scan")
    audit.add_argument("--scanner", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "install":
            install(args.destination.resolve(), args.archive)
            return 0
        return scan(args.scanner.resolve())
    except (OSError, ValueError, KeyError, tarfile.TarError, subprocess.SubprocessError):
        print("Secret check FAILED; diagnostic values withheld. See docs/SECRET_SCANNING.md.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
