"""Keep the reviewed toolchain and CI installation paths aligned."""

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def workflow():
    return yaml.safe_load((ROOT / ".github/workflows/ci.yml").read_text())


def steps(job):
    return workflow()["jobs"][job]["steps"]


def test_runtime_versions_are_exact_and_frontend_engines_match():
    node = (ROOT / ".node-version").read_text().strip()
    python = (ROOT / ".python-version").read_text().strip()
    assert re.fullmatch(r"24\.\d+\.\d+", node)
    assert re.fullmatch(r"3\.12\.\d+", python)
    package = json.loads((ROOT / "frontend/package.json").read_text())
    assert package["engines"]["node"] == node
    manager = package["packageManager"].split("+", 1)[0]
    assert manager == f"pnpm@{package['engines']['pnpm']}"
    assert re.fullmatch(r"pnpm@\d+\.\d+\.\d+\+sha512\.[a-f0-9]{128}",
                        package["packageManager"])
    assert yaml.safe_load((ROOT / "frontend/pnpm-workspace.yaml").read_text()) == {
        "packages": ["."], "engineStrict": True,
        "strictDepBuilds": True, "verifyDepsBeforeRun": "error",
        "allowBuilds": {"sharp@0.35.5": False, "unrs-resolver@1.11.1": False},
        "overrides": {
            "postcss@<8.5.31": "8.5.31",
            "sharp@<0.35.5": "0.35.5",
            "postcss-selector-parser@<7.1.6": "7.1.6",
            "js-yaml@>=4.0.0 <4.3.2": "4.3.2",
        },
        "patchedDependencies": {"braces@3.0.3": "patches/braces@3.0.3.patch"},
    }


def test_ci_uses_runtime_files_and_immutable_action_references():
    for job in ("backend", "frontend"):
        config = workflow()["jobs"][job]
        assert config["runs-on"] == "ubuntu-24.04"
        assert config["timeout-minutes"] == 20
        for step in steps(job):
            if "uses" in step:
                assert re.fullmatch(r"[\w-]+/[\w-]+@[a-f0-9]{40}", step["uses"])
            if step.get("uses", "").startswith("actions/checkout@"):
                assert step["with"]["persist-credentials"] is False
    assert workflow()["permissions"] == {"contents": "read"}
    python_setup = next(s for s in steps("backend")
                        if s.get("uses", "").startswith("actions/setup-python@"))
    assert python_setup["with"]["python-version-file"] == ".python-version"
    node_setup = next(s for s in steps("frontend")
                      if s.get("uses", "").startswith("actions/setup-node@"))
    assert node_setup["with"]["node-version-file"] == ".node-version"
    assert node_setup["with"]["package-manager-cache"] is False


def test_frontend_install_is_frozen_and_uses_declared_manager():
    setup = next(s for s in steps("frontend")
                 if s.get("uses", "").startswith("pnpm/action-setup@"))
    assert setup["with"] == {"package_json_file": "frontend/package.json", "run_install": False}
    commands = {s["name"]: s["run"].strip() for s in steps("frontend") if "run" in s}
    assert commands["Install dependencies"] == "pnpm install --frozen-lockfile"
    assert commands["Toolchain rejection checks"] == "pnpm run test:toolchain"
    assert commands["Build"] == "pnpm run build"
    assert commands["Type-check"] == "pnpm run type-check"
    assert not (ROOT / "frontend/package-lock.json").exists()


def test_backend_install_does_not_override_pinned_test_tools():
    install = next(s["run"] for s in steps("backend") if s.get("name") == "Install dependencies")
    assert install.strip().splitlines() == [
        "python -m pip --isolated install --require-hashes --no-deps -r requirements-bootstrap.txt",
        "python -m pip --isolated install --require-hashes --no-deps --no-build-isolation -r requirements-dev-lock.txt",
        "python -m pip check",
    ]


def test_frontend_audit_is_required_and_has_no_failure_or_advisory_exceptions():
    check = next(s for s in steps("frontend") if s.get("name") == "Frontend dependency advisories")
    assert check["run"].strip() == "pnpm run audit:dependencies"
    assert check.get("continue-on-error", False) is False
    package = json.loads((ROOT / "frontend/package.json").read_text())
    assert package["scripts"]["audit:dependencies"] == "pnpm audit --audit-level=low"
    assert package["scripts"]["test:dependencies"] == "node --test scripts/test-dependency-audit.mjs"
    assert package["scripts"]["test:patches"] == "node --test scripts/test-braces-patch.mjs"
    commands = [s.get("run", "").strip() for s in steps("frontend")]
    assert commands.index("pnpm run test:dependencies") < commands.index(check["run"].strip())
    assert commands.index("pnpm install --frozen-lockfile") < commands.index(check["run"].strip())
    assert commands.index("pnpm run test:patches") < commands.index("pnpm run build")


def test_ci_verifies_exports_and_audits_without_ignores_or_failure_fallbacks():
    check = next(s for s in steps("backend") if s.get("name") == "Dependency integrity and advisories")
    commands = check["run"]
    assert "scripts/export_dependencies.py --check" in commands
    assert "-m pip_audit --disable-pip --no-deps --strict" in commands
    for file in ("requirements-dev-lock.txt", "requirements-tools-lock.txt", "requirements-bootstrap.txt"):
        assert f"-r {file}" in commands
    assert "--require-hashes --no-deps --no-build-isolation -r requirements-tools-lock.txt" in commands
    assert "--ignore-vuln" not in commands and "||" not in commands
    assert check.get("continue-on-error", False) is False


def test_ci_installs_and_imports_the_runtime_without_dev_or_maintenance_tools():
    command = next(s["run"] for s in steps("backend") if s.get("name") == "Runtime-only installation")
    assert "--require-hashes --no-deps --no-build-isolation -r requirements-lock.txt" in command
    assert "from app.main import app" in command
    assert 'all(find_spec(name) is None for name in ("pytest", "poetry", "pip_audit"))' in command
    assert "requirements-dev-lock.txt" not in command
