"""Synthetic end-user JWT acceptance, before any local identity is provisioned."""

import json
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app.core import auth
from app.core.config import Settings, settings
from app.db.database import SessionLocal
from app.models.user import User


PROJECT = "https://auth.example.invalid"
SECRET = "synthetic-claims-contract-key-000000000000"


@pytest.fixture(scope="module")
def signing_keys():
    return {
        "HS256": SECRET,
        "ES256": ec.generate_private_key(ec.SECP256R1()),
        "RS256": rsa.generate_private_key(public_exponent=65537, key_size=2048),
    }


@pytest.fixture(params=["HS256", "ES256", "RS256"])
def access_token(request, monkeypatch, signing_keys):
    algorithm = request.param
    key = signing_keys[algorithm]
    fetches = []
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_URL", PROJECT)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SECRET)
    auth._get_jwks_client.cache_clear()

    def fetch_data(client):
        fetches.append(client.uri)
        public_jwk = json.loads(jwt.get_algorithm_by_name(algorithm).to_jwk(key.public_key()))
        public_jwk.update(kid="contract-key", alg=algorithm, use="sig")
        return {"keys": [public_jwk]}

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", fetch_data)

    def token(*, remove=(), headers=None, **overrides):
        now = int(time.time())
        claims = {
            "sub": "contract-user", "email": "investor@example.invalid",
            "iss": f"{PROJECT}/auth/v1", "aud": "authenticated",
            "iat": now, "exp": now + 300, "role": "authenticated",
            **overrides,
        }
        for name in remove:
            claims.pop(name, None)
        # The JWS encoder lets malformed claim types reach the real verifier.
        return jwt.api_jws.encode(
            json.dumps(claims).encode(), key, algorithm=algorithm,
            headers={"kid": "contract-key", **(headers or {})},
        )

    try:
        yield SimpleNamespace(token=token, algorithm=algorithm, fetches=fetches)
    finally:
        auth._get_jwks_client.cache_clear()


def _request(client, token):
    return client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {token}"})


def _no_users():
    with SessionLocal() as db:
        assert db.query(User).count() == 0


def test_valid_end_user_access_token(client, access_token):
    assert _request(client, access_token.token()).status_code == 200
    with SessionLocal() as db:
        assert db.query(User).one().supabase_user_id == "contract-user"


@pytest.mark.parametrize("claim", ["iss", "aud", "sub", "iat", "exp", "role"])
def test_required_claim_cannot_be_omitted(client, access_token, claim):
    response = _request(client, access_token.token(remove=[claim]))
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    _no_users()


@pytest.mark.parametrize("overrides", [
    {"iss": "https://another-project.example.invalid/auth/v1"},
    {"iss": f"{PROJECT}/auth/v1/extra"},
    {"iss": f"{PROJECT}/auth/v1/"},
    {"iss": []}, {"iss": None},
    {"aud": "wrong-audience"}, {"aud": None}, {"aud": {}},
    {"sub": ""}, {"sub": " "}, {"sub": " user"}, {"sub": "user\n"},
    {"sub": "x" * 65}, {"sub": 42}, {"sub": None},
    {"iat": "0"}, {"iat": True}, {"iat": -1}, {"iat": 1.5},
    {"iat": float("nan")}, {"iat": float("inf")},
    {"exp": "9999999999"}, {"exp": True}, {"exp": 9999999999.5},
    {"exp": float("nan")}, {"exp": float("inf")}, {"exp": 1},
    {"nbf": "0"}, {"nbf": True}, {"nbf": -1}, {"nbf": 1.5},
    {"nbf": float("nan")}, {"nbf": float("inf")},
    {"role": "anon"}, {"role": "service_role"}, {"role": None}, {"role": []},
    {"email": {}}, {"email": ["investor@example.invalid"]}, {"email": "x" * 256},
    {"email": "investor\0@example.invalid"}, {"email": "investor\n@example.invalid"},
], ids=lambda value: repr(value))
def test_malformed_or_wrong_context_claims_are_rejected(client, access_token, overrides):
    response = _request(client, access_token.token(**overrides))
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    _no_users()


@pytest.mark.parametrize("claim", ["iat", "nbf"])
def test_future_token_is_rejected(client, access_token, claim):
    token = access_token.token(**{claim: int(time.time()) + 60})
    assert _request(client, token).status_code == 401
    _no_users()


@pytest.mark.parametrize("email", [None, "", "new@example.invalid"])
def test_optional_email_and_audience_array_are_supported(client, access_token, email):
    assert _request(client, access_token.token(email=email, aud=["authenticated"])).status_code == 200


def test_issuer_is_configuration_not_token_key_url(client, access_token):
    token = access_token.token(headers={
        "jku": "https://untrusted.example.invalid/keys", "jwk": {"kid": "untrusted"},
    })
    assert _request(client, token).status_code == 200
    expected = [] if access_token.algorithm == "HS256" else [f"{PROJECT}/auth/v1/.well-known/jwks.json"]
    assert access_token.fetches == expected


def test_optional_email_can_be_absent_and_subject_matches_column_limit(client, access_token):
    assert _request(client, access_token.token(remove=["email"], sub="x" * 64)).status_code == 200


def test_configured_project_trailing_slash_does_not_change_issuer(client, access_token, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", PROJECT + "/")
    assert _request(client, access_token.token()).status_code == 200


def test_rejected_claims_cannot_update_an_existing_profile(client, access_token):
    assert _request(client, access_token.token()).status_code == 200
    invalid = access_token.token(iss="https://another.example.invalid/auth/v1", email="changed@example.invalid")
    assert _request(client, invalid).status_code == 401
    with SessionLocal() as db:
        assert db.query(User).one().email == "investor@example.invalid"


@pytest.mark.parametrize("field,value", [
    ("SUPABASE_URL", ""), ("SUPABASE_URL", "https://fixture:secret@auth.example.invalid"),
    ("SUPABASE_URL", f"{PROJECT}/untrusted-path"), ("SUPABASE_URL", "file:///tmp/keys"),
    ("SUPABASE_JWT_AUD", ""), ("SUPABASE_JWT_AUD", " authenticated "),
])
def test_enabled_auth_requires_trusted_project_and_audience(field, value):
    values = {
        "APP_ENV": "test", "DATABASE_URL": "sqlite:///:memory:",
        "LOCAL_DB_BOOTSTRAP": False, "AUTH_ENABLED": True,
        "SUPABASE_URL": PROJECT, "SUPABASE_JWT_AUD": "authenticated", field: value,
    }
    with pytest.raises(ValueError):
        Settings(_env_file=None, **values)
