"""Asymmetric authentication contracts using local keys and a mocked JWKS fetch."""

import io
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
    timeouts = []
    published = SimpleNamespace(keys=[public_jwk])
    supabase_url = "https://auth.example.invalid"

    class LocalOpener:
        def open(self, request, timeout):
            fetches.append(request.full_url)
            timeouts.append(timeout)
            return io.BytesIO(json.dumps({"keys": published.keys}).encode())

    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_URL", supabase_url)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    monkeypatch.setattr(jwt.jwks_client.urllib.request, "build_opener", lambda *args: LocalOpener())
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
            "role": "authenticated",
            **claims,
        }
        return jwt.encode(
            payload,
            signing_key or private_key,
            algorithm=algorithm,
            headers={"kid": kid},
        )

    try:
        yield SimpleNamespace(
            algorithm=algorithm, token=token, fetches=fetches, url=supabase_url,
            published=published, timeouts=timeouts,
        )
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


@pytest.fixture
def jwks_clock(monkeypatch):
    clock = SimpleNamespace(now=1000)
    local_time = SimpleNamespace(monotonic=lambda: clock.now)
    for module in (jwt.jwks_client, jwt.jwk_set_cache, jwt.api_jwk):
        monkeypatch.setattr(module, "time", local_time)
    return clock


def _publish_new_key(fixture, *, kid="rotated-key", keep_old=False):
    key = _private_key(fixture.algorithm)
    jwk = json.loads(jwt.get_algorithm_by_name(fixture.algorithm).to_jwk(key.public_key()))
    jwk.update(kid=kid, alg=fixture.algorithm, use="sig")
    fixture.published.keys = ([*fixture.published.keys, jwk] if keep_old else [jwk])
    return fixture.token(signing_key=key, kid=kid)


def test_known_key_uses_bounded_cache_and_network_timeout(jwks_auth, jwks_clock):
    token = jwks_auth.token()
    assert auth._decode_supabase_jwt(token)["sub"] == "local-asymmetric-user"
    assert auth._decode_supabase_jwt(token)["sub"] == "local-asymmetric-user"
    assert len(jwks_auth.fetches) == 1
    assert jwks_auth.timeouts == [5]
    verifier = auth._get_jwks_client(jwks_auth.url)
    assert verifier.jwk_set_cache.lifespan == 300
    assert not hasattr(verifier.get_signing_key, "cache_info")


def test_rotation_fetches_new_key_after_cooldown(jwks_auth, jwks_clock):
    old = jwks_auth.token()
    auth._decode_supabase_jwt(old)
    new = _publish_new_key(jwks_auth, keep_old=True)
    with pytest.raises(auth.AuthError):
        auth._decode_supabase_jwt(new)
    assert len(jwks_auth.fetches) == 1
    jwks_clock.now += 31
    assert auth._decode_supabase_jwt(new)["sub"] == "local-asymmetric-user"
    assert auth._decode_supabase_jwt(old)["sub"] == "local-asymmetric-user"
    assert len(jwks_auth.fetches) == 2


def test_removed_key_is_not_trusted_after_cache_expiry(jwks_auth, jwks_clock):
    old = jwks_auth.token()
    auth._decode_supabase_jwt(old)
    new = _publish_new_key(jwks_auth)
    # A cached key remains trusted until the documented TTL, not forever.
    assert auth._decode_supabase_jwt(old)["sub"] == "local-asymmetric-user"
    jwks_clock.now += 301
    with pytest.raises(auth.AuthError):
        auth._decode_supabase_jwt(old)
    assert auth._decode_supabase_jwt(new)["sub"] == "local-asymmetric-user"
    assert len(jwks_auth.fetches) == 2


def test_unknown_key_requests_cannot_force_unbounded_refreshes(jwks_auth, jwks_clock):
    unknown = jwks_auth.token(kid="never-published")
    for _ in range(5):
        with pytest.raises(auth.AuthError):
            auth._decode_supabase_jwt(unknown)
    assert len(jwks_auth.fetches) == 1
    jwks_clock.now += 31
    for _ in range(5):
        with pytest.raises(auth.AuthError):
            auth._decode_supabase_jwt(unknown)
    assert len(jwks_auth.fetches) == 2


def test_changed_key_material_is_refetched_after_ttl(jwks_auth, jwks_clock):
    old = jwks_auth.token()
    auth._decode_supabase_jwt(old)
    new = _publish_new_key(jwks_auth, kid="local-contract-key")
    jwks_clock.now += 301
    with pytest.raises(auth.AuthError):
        auth._decode_supabase_jwt(old)
    assert auth._decode_supabase_jwt(new)["sub"] == "local-asymmetric-user"
    assert len(jwks_auth.fetches) == 2


def test_jwk_algorithm_must_match_selected_signing_path(client, jwks_auth, monkeypatch):
    verifier = auth._get_jwks_client(jwks_auth.url)
    monkeypatch.setattr(verifier, "get_signing_key_from_jwt", lambda token: SimpleNamespace(
        algorithm_name="HS256", key=b"untrusted-key-material",
    ))
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {jwks_auth.token()}"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}


@pytest.mark.parametrize("payload", [b"not-json", b"[]", b"{}", b'{"keys": []}'])
def test_malformed_jwks_is_a_sanitized_authentication_failure(client, jwks_auth, monkeypatch, payload):
    class BadOpener:
        def open(self, request, timeout):
            return io.BytesIO(payload)

    monkeypatch.setattr(jwt.jwks_client.urllib.request, "build_opener", lambda *args: BadOpener())
    response = client.get("/api/v1/portfolios/", headers={"Authorization": f"Bearer {jwks_auth.token()}"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}
