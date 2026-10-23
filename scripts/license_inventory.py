"""Validate a locked Python environment and inventory license metadata, not legal approval."""

import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import sys
import tomllib

from packaging.licenses import InvalidLicenseExpression, canonicalize_license_expression
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = {
    "runtime": "requirements-lock.txt",
    "development": "requirements-dev-lock.txt",
    "maintenance": "requirements-tools-lock.txt",
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def export_identities(text, environment=None):
    identities = set()
    active = False
    hashes = 0
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("--hash="):
            if not active or not re.fullmatch(r"--hash=sha256:[a-f0-9]{64}(?:\s+\\)?", line):
                raise ValueError("Malformed generated hash")
            hashes += 1
            continue
        if active and not hashes:
            raise ValueError("Unhashed export requirement")
        requirement = Requirement(line.removesuffix("\\").strip())
        specifiers = list(requirement.specifier)
        if requirement.url or len(specifiers) != 1 or specifiers[0].operator != "==":
            raise ValueError("Inventory requires exact generated exports")
        Version(specifiers[0].version)
        active, hashes = True, 0
        if not requirement.marker or requirement.marker.evaluate(environment):
            identities.add((canonicalize_name(requirement.name), specifiers[0].version))
    if active and not hashes:
        raise ValueError("Unhashed export requirement")
    return identities


def license_metadata(distribution):
    metadata = distribution.metadata
    expression = metadata.get("License-Expression")
    legacy = metadata.get("License")
    normalized = None
    if expression and legacy:
        status = "conflicting-fields"
    elif expression or legacy:
        try:
            normalized = canonicalize_license_expression(expression or legacy)
            status = "spdx-expression" if expression else "legacy-spdx-shaped"
        except InvalidLicenseExpression:
            status = "invalid-expression" if expression else "legacy-text"
    else:
        status = "classifiers-only" if any(
            item.startswith("License ::") for item in metadata.get_all("Classifier", [])
        ) else "missing"
    content = distribution.read_text("METADATA")
    if content is None:
        raise ValueError("Installed distribution metadata is unavailable")
    return {
        "metadataStatus": status,
        "expression": normalized,
        "metadataSha256": digest(content.encode()),
        "legacyLicenseSha256": digest(legacy.encode()) if legacy else None,
        "licenseFileDeclarations": len(metadata.get_all("License-File", [])),
        "reviewStatus": "required",
    }


def python_inventory(root, group, distributions=None):
    backend = root / "backend"
    target_bytes = (root / ".python-version").read_bytes()
    if target_bytes.decode().strip() != platform.python_version():
        raise ValueError("Inventory requires the exact supported Python version")
    lock_bytes = (backend / "poetry.lock").read_bytes()
    lock = tomllib.loads(lock_bytes.decode())
    locked = {}
    for package in lock["package"]:
        identity = (canonicalize_name(package["name"]), package["version"])
        if identity in locked:
            raise ValueError("Duplicate locked identity")
        locked[identity] = package["groups"]
    if not locked:
        raise ValueError("Empty lock cannot be inventoried")
    sources = {}
    expected = set()
    for filename in ("requirements-bootstrap.txt", EXPORTS[group]):
        content = (backend / filename).read_bytes()
        sources[filename] = digest(content)
        selected = export_identities(content.decode())
        if not selected:
            raise ValueError("Empty selected export")
        expected |= selected
    if not expected or not expected <= locked.keys():
        raise ValueError("Selected exports do not match the lock")
    installed = {}
    for distribution in (importlib.metadata.distributions() if distributions is None else distributions):
        identity = (canonicalize_name(distribution.metadata["Name"]), distribution.version)
        if identity in installed:
            raise ValueError("Duplicate installed distribution")
        installed[identity] = distribution
    if installed.keys() != expected:
        raise ValueError("Installed environment differs from evaluated exports; use a fresh environment")
    records = []
    for (name, version), groups in sorted(locked.items()):
        distribution = installed.get((name, version))
        record = {"name": name, "version": version, "lockedGroups": sorted(groups),
                  "coverage": "installed" if distribution is not None else "outside-selected-environment",
                  "reviewStatus": "required"}
        if distribution is not None:
            record.update(license_metadata(distribution))
        records.append(record)
    return {
        "schemaVersion": 1, "inventoryStatus": "validated", "licenseReviewStatus": "required",
        "ecosystem": "python", "environment": group, "python": platform.python_version(),
        "platform": {"system": sys.platform, "machine": platform.machine()},
        "sources": {".python-version": digest(target_bytes), "poetry.lock": digest(lock_bytes), **sources},
        "summary": {"lockedIdentities": len(locked), "installedIdentities": len(installed),
                    "outsideSelectedEnvironment": len(locked) - len(installed),
                    "metadataStatuses": dict(sorted(Counter(
                        row["metadataStatus"] for row in records if "metadataStatus" in row
                    ).items()))},
        "records": records,
    }


def write_report(report, destination):
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf8") as output:
        output.write(json.dumps(report, indent=2, sort_keys=True) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=EXPORTS, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = python_inventory(ROOT, args.environment)
        write_report(report, args.output)
        print(json.dumps({key: report[key] for key in (
            "inventoryStatus", "licenseReviewStatus", "ecosystem", "environment", "summary",
        )}, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, TypeError):
        print("License inventory FAILED; no approval inferred. See docs/LICENSE_REVIEW.md.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
