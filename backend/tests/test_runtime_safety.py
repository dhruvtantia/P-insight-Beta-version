"""Synthetic configuration, startup and public diagnostic boundary contracts."""

import os
import subprocess
import sys
from pathlib import Path

import jwt
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import OperationalError

from app.core.config import Settings, settings
from app.db import init_db as database_startup


def configured(**overrides):
    return Settings(_env_file=None, **overrides)


def deployed(**overrides):
    values = dict(
        APP_ENV="production", AUTH_ENABLED=True,
        DATABASE_URL="postgresql+psycopg2://fixture:fixture@db.example.invalid/app",
        FRONTEND_URL="https://app.example.invalid", SUPABASE_URL="https://auth.example.invalid",
        LOCAL_DB_BOOTSTRAP=False,
    )
    return configured(**(values | overrides))


@pytest.mark.parametrize("environment", ["production", "staging"])
@pytest.mark.parametrize("override", [
    {"AUTH_ENABLED": False}, {"DEBUG": True}, {"DOCS_ENABLED": True},
    {"LOG_LEVEL": "DEBUG"}, {"LOCAL_DB_BOOTSTRAP": True},
    {"DATABASE_URL": "sqlite:///local.db"},
    {"DATABASE_URL": "postgresql+asyncpg://fixture@db.example.invalid/app"},
    {"DATABASE_URL": "postgresql+psycopg2:///app"},
    {"SUPABASE_URL": ""}, {"SUPABASE_URL": "http://auth.example.invalid"},
    {"SUPABASE_URL": "https://fixture:secret@auth.example.invalid"},
    {"SUPABASE_JWT_AUD": ""}, {"FRONTEND_URL": "http://app.example.invalid"},
    {"FRONTEND_URL": "https://localhost"}, {"ALLOWED_ORIGINS": ["*"]},
    {"ALLOWED_ORIGINS": ["https://127.0.0.1"]},
    {"ALLOWED_ORIGINS": ["https://127.1"]},
    {"ALLOWED_ORIGINS": ["https://localhost."]},
    {"ALLOWED_ORIGINS": ["https://[::1]"]},
])
def test_deployed_configuration_rejects_unsafe_settings(environment, override):
    with pytest.raises(ValidationError):
        deployed(**(override | {"APP_ENV": environment}))


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_asymmetric_deployed_configuration_does_not_require_shared_secret(environment):
    config = deployed(APP_ENV=environment, SUPABASE_JWT_SECRET="")
    assert config.cors_origins() == ["https://app.example.invalid"]
    assert config.LOCAL_DB_BOOTSTRAP is False


@pytest.mark.parametrize("name,value", [
    ("APP_ENV", "prod"), ("APP_ENV", "Production"), ("APP_ENV", ""),
    ("DEFAULT_DATA_MODE", "mock"), ("LOG_LEVEL", "verbose"),
    ("DATABASE_URL", "not-a-url"),
])
def test_unknown_configuration_values_fail(name, value):
    with pytest.raises(ValidationError):
        configured(**{name: value})


def test_configuration_error_text_does_not_echo_credentials():
    with pytest.raises(ValidationError) as error:
        deployed(DEBUG=True, SUPABASE_JWT_SECRET="fixture-private-secret")
    assert "fixture-private-secret" not in str(error.value)


@pytest.mark.parametrize("raw", [
    "https://app.example.invalid, https://www.example.invalid",
    '["https://app.example.invalid", "https://www.example.invalid"]',
])
def test_documented_environment_origin_formats_parse(monkeypatch, raw):
    monkeypatch.setenv("ALLOWED_ORIGINS", raw)
    config = deployed()
    assert config.cors_origins() == ["https://app.example.invalid", "https://www.example.invalid"]


@pytest.mark.parametrize("raw", [
    "*", "null", '["https://app.example.invalid", 1]', '{"origin":"https://app.example.invalid"}',
    "https://app.example.invalid,", "https://app.example.invalid/path",
    "https://app.example.invalid?token=fixture", "https://app.example.invalid/#fixture",
    "https://user:fixture@app.example.invalid", "https://*.example.invalid", "ftp://example.invalid",
    "https://app.example.invalid:bad", "[not-json", "https://app.example.invalid\\evil",
])
def test_malformed_origins_fail_without_exposing_values(monkeypatch, raw):
    monkeypatch.setenv("ALLOWED_ORIGINS", raw)
    with pytest.raises(ValidationError):
        deployed()


def test_local_convenience_is_explicit_and_not_added_to_remote_origins():
    config = configured(APP_ENV="development", LOCAL_DB_BOOTSTRAP=True)
    assert config.cors_origins() == ["http://localhost:3000"]
    assert deployed().cors_origins() == ["https://app.example.invalid"]


def test_local_bootstrap_cannot_change_postgres():
    with pytest.raises(ValidationError):
        configured(LOCAL_DB_BOOTSTRAP=True, DATABASE_URL="postgresql://fixture@localhost/app")


def test_import_rejects_unsafe_production_before_creating_database(tmp_path):
    path = tmp_path / "must-not-exist.db"
    env = os.environ | {
        "APP_ENV": "production", "AUTH_ENABLED": "false", "LOCAL_DB_BOOTSTRAP": "false",
        "DATABASE_URL": f"sqlite:///{path}", "ALLOWED_ORIGINS": "",
    }
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"], cwd=Path(__file__).parents[1],
        env=env, capture_output=True, text=True, timeout=30,
    )
    assert result.returncode != 0
    assert not path.exists()
    assert "AUTH_ENABLED" in result.stderr


@pytest.fixture
def startup_database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'startup.db'}")
    monkeypatch.setattr(database_startup, "engine", engine)
    monkeypatch.setattr(settings, "LOCAL_DB_BOOTSTRAP", False, raising=False)
    statements = []
    event.listen(engine, "before_cursor_execute", lambda c, cu, stmt, p, ctx, many: statements.append(stmt))
    yield engine, statements
    engine.dispose()


def test_managed_startup_refuses_unmigrated_database_without_creating_tables(startup_database):
    engine, statements = startup_database
    with pytest.raises(RuntimeError, match="migration"):
        database_startup.init_db()
    assert inspect(engine).get_table_names() == []
    assert not any(s.lstrip().upper().startswith(("CREATE", "ALTER", "INSERT", "UPDATE")) for s in statements)


def test_managed_startup_checks_current_migration_read_only(startup_database):
    from alembic import command
    from alembic.config import Config

    engine, statements = startup_database
    # env.py reads the configured URL, so select only this synthetic database.
    old_url = settings.DATABASE_URL
    settings.DATABASE_URL = str(engine.url)
    try:
        command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    finally:
        settings.DATABASE_URL = old_url
    statements.clear()
    database_startup.init_db()
    assert not any(s.lstrip().upper().startswith(("CREATE", "ALTER", "INSERT", "UPDATE")) for s in statements)
    with engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num='unknown-fixture-revision'"))
    with pytest.raises(RuntimeError, match="migration"):
        database_startup.init_db()


def test_explicit_sqlite_bootstrap_is_idempotent_and_does_not_seed_demo(startup_database, monkeypatch):
    engine, _ = startup_database
    monkeypatch.setattr(settings, "LOCAL_DB_BOOTSTRAP", True, raising=False)
    database_startup.init_db()
    database_startup.init_db()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM portfolios")).scalar() == 0


def test_bootstrap_does_not_swallow_unexpected_ddl_failures(startup_database, monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_DB_BOOTSTRAP", True)
    monkeypatch.setattr(database_startup, "_COLUMN_MIGRATIONS", [("portfolios", "fixture", "INVALID TYPE (", "NULL")])
    with pytest.raises(OperationalError):
        database_startup.init_db()


def test_bootstrap_refuses_mutated_deployed_environment(startup_database, monkeypatch):
    engine, _ = startup_database
    monkeypatch.setattr(settings, "LOCAL_DB_BOOTSTRAP", True)
    monkeypatch.setattr(settings, "APP_ENV", "production")
    with pytest.raises(RuntimeError, match="not permitted"):
        database_startup.init_db()
    assert inspect(engine).get_table_names() == []


def test_public_health_has_no_configuration_inventory(client):
    payload = client.get("/health").json()
    assert set(payload) == {"status"}


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_detailed_diagnostics_are_not_available_remotely(client, monkeypatch, environment):
    monkeypatch.setattr(settings, "APP_ENV", environment)
    response = client.get("/api/v1/system/diagnostics")
    assert response.status_code == 404


def test_local_diagnostics_preserve_boolean_only_configuration(client):
    response = client.get("/api/v1/system/diagnostics")
    assert response.status_code == 200
    assert isinstance(response.json()["features"], dict)
    assert all(isinstance(value, bool) for value in response.json()["api_keys"].values())


def test_local_diagnostics_honor_authentication_when_enabled(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    assert client.get("/api/v1/system/diagnostics").status_code == 401


def test_readiness_database_failure_is_sanitized(client, monkeypatch):
    from app.db import database

    def failed_session():
        raise RuntimeError("fixture-password SQL fixture-private-host /private/fixture.db")

    monkeypatch.setattr(database, "SessionLocal", failed_session)
    response = client.get("/readiness")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready", "database": {"ok": False, "driver": "unavailable"}}


@pytest.mark.parametrize("status", [500, 502, 503])
def test_http_server_errors_have_constant_external_messages(status):
    from app.core.errors import install_error_handlers

    app = FastAPI()
    install_error_handlers(app)

    @app.get("/failure")
    def failure():
        raise HTTPException(status, "fixture-password", headers={"Retry-After": "30"})

    response = TestClient(app).get("/failure")
    assert response.status_code == status
    assert "fixture-password" not in response.text
    assert response.headers["retry-after"] == "30"


def test_unhandled_exception_is_sanitized():
    from app.core.errors import install_error_handlers

    app = FastAPI()
    install_error_handlers(app)

    @app.get("/failure")
    def failure():
        raise RuntimeError("fixture-password")

    response = TestClient(app, raise_server_exceptions=False).get("/failure")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 422, 429])
def test_expected_client_errors_keep_status_details_and_headers(status):
    from app.core.errors import install_error_handlers

    app = FastAPI()
    install_error_handlers(app)

    @app.get("/failure")
    def failure():
        raise HTTPException(status, "Safe client instruction", headers={"WWW-Authenticate": "Bearer"})

    response = TestClient(app).get("/failure")
    assert response.status_code == status
    assert response.json() == {"detail": "Safe client instruction"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_reviewed_typed_availability_contract_is_not_replaced():
    from app.core.errors import PublicServiceError, install_error_handlers

    app = FastAPI()
    install_error_handlers(app)

    @app.get("/failure")
    def failure():
        raise PublicServiceError(503, {"status": "disabled", "feature_id": "fixture-feature"})

    response = TestClient(app).get("/failure")
    assert response.json() == {"detail": {"status": "disabled", "feature_id": "fixture-feature"}}


def test_cors_preflight_accepts_only_configured_origin(client):
    allowed = client.options("/health", headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET",
    })
    denied = client.options("/health", headers={
        "Origin": "https://unlisted.example.invalid", "Access-Control-Request-Method": "GET",
    })
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_jwks_failure_does_not_echo_provider_exception(monkeypatch):
    from app.core import auth

    class UnavailableClient:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientError("fixture-private-host fixture-password")

    monkeypatch.setattr(settings, "SUPABASE_URL", "https://auth.example.invalid")
    monkeypatch.setattr(auth, "_get_jwks_client", lambda url: UnavailableClient())
    monkeypatch.setattr(jwt, "get_unverified_header", lambda token: {"alg": "ES256"})
    with pytest.raises(auth.AuthError) as error:
        auth._decode_supabase_jwt("synthetic-token")
    assert error.value.detail == "Invalid token"


def test_schema_url_is_disabled_with_docs(client):
    assert client.get("/openapi.json").status_code == 404
