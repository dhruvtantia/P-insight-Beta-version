"""Asymmetric authentication contracts using local keys and a mocked JWKS fetch."""

import json
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app.core import auth
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.user import User


def _private_key(algorithm):
    if algorithm == "ES256":
        return ec.generate_private_key(ec.SECP256R1())
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(params=["ES256", "RS256"])
def jwks_auth(request, monkeypatch):
    algorithm = request.param
    private_key = _private_key(algorithm)
    public_jwk = json.loads(jwt.get_algorithm_by_name(algorithm).to_jwk(private_key.public_key()))
    public_jwk.update(kid="local-contract-key", alg=algorithm, use="sig")
    fetches = []
    supabase_url = "https://auth.example.invalid"

    def fetch_data(client):
        fetches.append(client.uri)
        return {"keys": [public_jwk]}

    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_URL", supabase_url)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", fetch_data)
    auth._get_jwks_client.cache_clear()

    def token(*, signing_key=None, kid="local-contract-key", **claims):
        now = int(time.time())
        payload = {
            "sub": "local-asymmetric-user",
            "email": "investor@example.invalid",
            "aud": "authenticated",
            "iss": f"{supabase_url}/auth/v1",
            "iat": now,
            "exp": now + 300,
            **claims,
        }
        return jwt.encode(
            payload,
            signing_key or private_key,
            algorithm=algorithm,
            headers={"kid": kid},
        )

    try:
        yield SimpleNamespace(algorithm=algorithm, token=token, fetches=fetches, url=supabase_url)
    finally:
        auth._get_jwks_client.cache_clear()


def test_asymmetric_token_provisions_user_through_protected_route(client, jwks_auth):
    response = client.get(
        "/api/v1/portfolios/",
        headers={"Authorization": f"Bearer {jwks_auth.token()}"},
    )
    assert response.status_code == 200
    with SessionLocal() as db:
        user = db.query(User).filter(User.supabase_user_id == "local-asymmetric-user").one()
        assert user.email == "investor@example.invalid"
    assert jwks_auth.fetches
    assert set(jwks_auth.fetches) == {f"{jwks_auth.url}/auth/v1/.well-known/jwks.json"}


def test_asymmetric_token_with_wrong_signature_is_rejected(client, jwks_auth):
    token = jwks_auth.token(signing_key=_private_key(jwks_auth.algorithm))
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_asymmetric_token_with_wrong_audience_is_rejected(client, jwks_auth):
    token = jwks_auth.token(aud="different-project-audience")
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_expired_asymmetric_token_is_rejected(client, jwks_auth):
    token = jwks_auth.token(exp=1)
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_unknown_jwks_key_is_rejected(client, jwks_auth):
    token = jwks_auth.token(kid="unknown-key")
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_jwks_fetch_failure_is_rejected(client, jwks_auth, monkeypatch):
    def unavailable(client):
        raise jwt.PyJWKClientError("Local fixture simulates unavailable JWKS")

    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", unavailable)
    response = client.get(
        "/api/v1/portfolios/",
        headers={"Authorization": f"Bearer {jwks_auth.token()}"},
    )
    assert response.status_code == 401


def test_missing_asymmetric_configuration_is_rejected(client, jwks_auth, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    response = client.get(
        "/api/v1/portfolios/",
        headers={"Authorization": f"Bearer {jwks_auth.token()}"},
    )
    assert response.status_code == 401
    assert jwks_auth.fetches == []


def test_unapproved_signing_algorithm_is_rejected(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    token = jwt.encode(
        {"sub": "local-user", "aud": "authenticated"},
        "local-test-key-not-used-by-server-" * 3,
        algorithm="HS512",
    )
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
