"""App, test and maintenance environments must share one reviewed dependency graph."""

import re
import hashlib
import os
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path

import pytest
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name

BACKEND = Path(__file__).resolve().parents[1]
EXPORTS = (
    "requirements-lock.txt", "requirements-dev-lock.txt",
    "requirements-tools-lock.txt", "requirements-bootstrap.txt",
)


def exported_requirements(filename):
    entries = {}
    source = (BACKEND / filename).read_text().replace("\\\n", "")
    for line in source.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = re.split(r"\s+--hash=", line.strip())
        requirement = Requirement(parts[0].strip())
        assert requirement.url is None
        assert len(requirement.specifier) == 1
        pin = next(iter(requirement.specifier))
        assert pin.operator == "==" and "*" not in pin.version
        assert parts[1:], f"Missing integrity hashes for {requirement.name}"
        assert all(re.fullmatch(r"sha256:[a-f0-9]{64}", h.strip()) for h in parts[1:])
        name = canonicalize_name(requirement.name)
        assert name not in entries
        entries[name] = pin.version
    assert entries
    return entries


@pytest.mark.parametrize("filename", EXPORTS)
def test_exported_requirements_are_exact_hashed_and_match_poetry_lock(filename):
    lock = tomllib.loads((BACKEND / "poetry.lock").read_text())
    locked = {canonicalize_name(p["name"]): p["version"] for p in lock["package"]}
    for name, version in exported_requirements(filename).items():
        assert locked[name] == version


def test_runtime_excludes_test_and_maintenance_tools():
    runtime = exported_requirements("requirements-lock.txt")
    dev = exported_requirements("requirements-dev-lock.txt")
    tools = exported_requirements("requirements-tools-lock.txt")
    bootstrap = exported_requirements("requirements-bootstrap.txt")
    assert runtime.items() <= dev.items()
    assert {"pytest", "pytest-asyncio", "ruff"} <= dev.keys()
    assert {"poetry", "poetry-plugin-export", "pip-audit"} <= tools.keys()
    assert {"pip", "setuptools", "wheel", "packaging"} <= bootstrap.keys()
    assert not {"pytest", "pytest-asyncio", "ruff", "poetry", "pip-audit", "virtualenv"} & runtime.keys()
    assert not {"poetry", "pip-audit", "virtualenv"} & dev.keys()


def test_manifest_targets_the_verified_python_and_keeps_numerical_pins():
    manifest = tomllib.loads((BACKEND / "pyproject.toml").read_text())
    python = SpecifierSet(manifest["project"]["requires-python"])
    assert "3.12.13" in python
    assert "3.11.13" not in python and "3.13.0" not in python
    assert manifest["tool"]["poetry"]["package-mode"] is False
    assert (BACKEND / manifest["project"]["readme"]).is_file()
    runtime = exported_requirements("requirements-lock.txt")
    assert {name: runtime[name] for name in ("numpy", "pandas", "scipy", "scikit-learn")} == {
        "numpy": "2.5.1", "pandas": "2.3.3", "scipy": "1.18.0", "scikit-learn": "1.9.0",
    }


def test_framework_schema_metadata_keeps_multipart_uploads_and_optional_error_fields():
    from app.main import app

    schema = app.openapi()
    for path in (
        "/api/v1/upload/parse", "/api/v1/upload/confirm", "/api/v1/upload/v2/confirm",
        "/api/v1/portfolio/upload", "/api/v1/portfolios/{portfolio_id}/refresh",
    ):
        content = schema["paths"][path]["post"]["requestBody"]["content"]
        assert set(content) == {"multipart/form-data"}
        body = content["multipart/form-data"]["schema"]["$ref"].split("/")[-1]
        file = schema["components"]["schemas"][body]["properties"]["file"]
        assert file["type"] == "string"
        assert file["contentMediaType"] == "application/octet-stream"
    error = schema["components"]["schemas"]["ValidationError"]
    assert {"ctx", "input"} <= error["properties"].keys()
    assert not {"ctx", "input"} & set(error["required"])


def fixture_wheel(tmp_path, *, dependency=None):
    wheel = tmp_path / "pinsight_lock_fixture-1.0.0-py3-none-any.whl"
    metadata = "Metadata-Version: 2.1\nName: pinsight-lock-fixture\nVersion: 1.0.0\n"
    if dependency:
        metadata += f"Requires-Dist: {dependency}\n"
    info = "pinsight_lock_fixture-1.0.0.dist-info"
    with zipfile.ZipFile(wheel, "w") as archive:
        archive.writestr("pinsight_lock_fixture/__init__.py", "")
        archive.writestr(f"{info}/METADATA", metadata)
        archive.writestr(f"{info}/WHEEL", "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
        archive.writestr(f"{info}/RECORD", "")
    return wheel


def test_real_pip_rejects_wrong_artifact_hash_without_network(tmp_path):
    fixture_wheel(tmp_path)
    requirements = tmp_path / "requirements.txt"
    requirements.write_text(f"pinsight-lock-fixture==1.0.0 --hash=sha256:{'0' * 64}\n")
    result = subprocess.run([
        sys.executable, "-m", "pip", "--isolated", "install", "--dry-run", "--require-hashes",
        "--no-deps", "--no-index", "--find-links", str(tmp_path), "-r", str(requirements),
    ], capture_output=True, text=True, timeout=30)
    assert result.returncode != 0
    assert "DO NOT MATCH THE HASHES" in result.stderr


def test_pip_check_catches_missing_transitive_dependency_without_installing_it(tmp_path):
    wheel = fixture_wheel(tmp_path, dependency="pinsight-missing-fixture-dependency>=1")
    requirements = tmp_path / "requirements.txt"
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    requirements.write_text(f"pinsight-lock-fixture==1.0.0 --hash=sha256:{digest}\n")
    target = tmp_path / "installed"
    subprocess.run([
        sys.executable, "-m", "pip", "--isolated", "install", "--require-hashes", "--no-deps",
        "--no-index", "--find-links", str(tmp_path), "--target", str(target), "-r", str(requirements),
    ], check=True, capture_output=True, text=True, timeout=30)
    result = subprocess.run([
        sys.executable, "-m", "pip", "check",
    ], env={**os.environ, "PYTHONPATH": str(target)}, capture_output=True, text=True, timeout=30)
    assert result.returncode != 0
    assert "pinsight-lock-fixture 1.0.0 requires pinsight-missing-fixture-dependency" in result.stdout
