"""Validate the unapplied bootstrap template; no provider account or live DB access."""

from pathlib import Path

import pytest
import yaml

from app.core.config import Settings, settings
from app.services.feature_registry import get_feature_registry

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "deploy/staging/render-api.template.yaml"


def service():
    blueprint = yaml.safe_load(TEMPLATE.read_text())
    assert set(blueprint) == {"services"}
    assert len(blueprint["services"]) == 1
    return blueprint["services"][0]


def values():
    entries = service()["envVars"]
    assert len({row["key"] for row in entries}) == len(entries)
    return {row["key"]: row["value"] for row in entries if "value" in row}


def test_template_is_manual_api_only_with_no_fake_worker_or_automatic_migration():
    item = service()
    assert item["type"] == "web" and item["runtime"] == "python"
    assert item["rootDir"] == "backend" and item["branch"] == "main"
    assert item["autoDeployTrigger"] == "off"
    assert item["numInstances"] == 1
    assert item["healthCheckPath"] == "/readiness"
    assert item["startCommand"] == (
        "python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1"
    )
    assert "preDeployCommand" not in item
    assert "alembic" not in item["buildCommand"] + item["startCommand"]
    assert not (ROOT / "render.yaml").exists()
    assert not (ROOT / "frontend/vercel.json").exists()


def test_template_preserves_exact_python_and_hash_required_runtime_install():
    item = service()
    version = (ROOT / ".python-version").read_text().strip()
    assert values()["PYTHON_VERSION"] == version
    assert f"platform.python_version() == '{version}'" in item["buildCommand"]
    assert item["buildCommand"].startswith("set -eu\n")
    assert "--require-hashes --no-deps -r requirements-bootstrap.txt" in item["buildCommand"]
    assert "--require-hashes --no-deps --no-build-isolation -r requirements-lock.txt" in item["buildCommand"]
    assert "python -m pip check" in item["buildCommand"]
    for bypass in ("requirements-dev", "requirements-tools", "||", "--trusted-host", "--upgrade"):
        assert bypass not in item["buildCommand"]


def test_template_has_no_unknown_settings_secret_values_or_implicit_enabled_features():
    config = values()
    assert all(isinstance(value, str) for value in config.values())
    assert set(config) <= set(Settings.model_fields) | {"PYTHON_VERSION"}
    flags = {key for key in Settings.model_fields if key.startswith("FEATURE_")}
    assert flags <= config.keys()
    for flag in flags | {"LIVE_API_ENABLED", "BROKER_SYNC_ENABLED", "AI_CHAT_ENABLED", "ADVANCED_ANALYTICS_ENABLED"}:
        assert config[flag] == "false"
    supplied = [row for row in service()["envVars"] if "value" not in row]
    assert {row["key"] for row in supplied} == {"DATABASE_URL", "SUPABASE_URL", "FRONTEND_URL"}
    assert all(row == {"key": row["key"], "sync": False} for row in supplied)
    assert not any("KEY" in key or "SECRET" in key for key in config)


def configured_settings(**overrides):
    config = values()
    config.pop("PYTHON_VERSION")
    config.update({
        "DATABASE_URL": "postgresql+psycopg2://app:synthetic@db.example.invalid/staging?sslmode=verify-full",
        "SUPABASE_URL": "https://auth.example.invalid",
        "FRONTEND_URL": "https://app.example.invalid",
    })
    config.update(overrides)
    return Settings(_env_file=None, **config)


def test_synthetic_operator_values_produce_staging_settings_without_local_fallback():
    candidate = configured_settings()
    assert candidate.APP_ENV == "staging" and candidate.AUTH_ENABLED
    assert not candidate.LOCAL_DB_BOOTSTRAP and not candidate.DEBUG and not candidate.DOCS_ENABLED
    assert candidate.cors_origins() == ["https://app.example.invalid"]
    assert not candidate.is_sqlite()


@pytest.mark.parametrize("override", [
    {"AUTH_ENABLED": "false"}, {"DATABASE_URL": "sqlite:///:memory:"},
    {"FRONTEND_URL": "http://localhost:3000"}, {"LOCAL_DB_BOOTSTRAP": "true"},
    {"DEBUG": "true"}, {"DOCS_ENABLED": "true"},
])
def test_existing_runtime_guard_rejects_unsafe_bootstrap_overrides(override):
    with pytest.raises(ValueError):
        configured_settings(**override)


def test_bootstrap_registry_has_no_product_feature_enabled(monkeypatch):
    candidate = configured_settings()
    for key in values():
        if key in Settings.model_fields:
            monkeypatch.setattr(settings, key, getattr(candidate, key))
    assert all(feature.status == "disabled" for feature in get_feature_registry().features)


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/v1/portfolio/full?mode=uploaded", None),
    ("get", "/api/v1/portfolios/", None),
    ("post", "/api/v1/upload/parse", None),
    ("get", "/api/v1/watchlist/", None),
    ("get", "/api/v1/portfolios/1/snapshots", None),
])
def test_bootstrap_product_route_flags_block_requests_in_local_fixture(client, monkeypatch, method, path, body):
    # Local auth-disabled test client isolates feature gating, not remote auth acceptance.
    for key, value in values().items():
        if key.startswith("FEATURE_") or key in {
            "LIVE_API_ENABLED", "BROKER_SYNC_ENABLED", "AI_CHAT_ENABLED", "ADVANCED_ANALYTICS_ENABLED",
        }:
            monkeypatch.setattr(settings, key, value == "true")
    response = getattr(client, method)(path, **({"json": body} if body is not None else {}))
    assert response.status_code == 503
    assert response.json()["detail"]["status"] == "disabled"
