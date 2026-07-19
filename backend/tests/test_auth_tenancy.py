"""
Contract tests for the authentication & tenancy layer (app.core.auth).

Covers both modes:
  - AUTH_ENABLED = False → legacy single-user (no token, user_id None)
  - AUTH_ENABLED = True  → Supabase HS256 token required, get-or-create user
"""

import jwt
import pytest

from app.core.auth import AuthError, get_current_user, get_current_user_id
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.user import User

# ≥32 bytes to satisfy PyJWT's HS256 minimum-key-length guidance.
_TEST_SECRET = "unit-test-jwt-secret-000000000000000000"


def _make_token(sub="user-abc-123", email="investor@example.com", aud=None, secret=_TEST_SECRET):
    payload = {"sub": sub, "email": email, "aud": aud or settings.SUPABASE_JWT_AUD}
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def auth_enabled(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", _TEST_SECRET)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    yield


# ── Legacy mode (auth disabled) ──────────────────────────────────────────────

def test_legacy_mode_returns_no_user_without_token():
    db = SessionLocal()
    try:
        assert get_current_user(db=db, authorization=None) is None
        assert get_current_user_id(user=None) is None
    finally:
        db.close()


# ── Enabled mode ─────────────────────────────────────────────────────────────

def test_valid_token_provisions_user(auth_enabled):
    db = SessionLocal()
    try:
        token = _make_token(sub="sub-xyz", email="a@b.com")
        user = get_current_user(db=db, authorization=f"Bearer {token}")
        assert user is not None
        assert user.supabase_user_id == "sub-xyz"
        assert user.email == "a@b.com"
        assert user.id is not None

        # Second call with same sub must reuse the row (get-or-create).
        again = get_current_user(db=db, authorization=f"Bearer {token}")
        assert again.id == user.id
        assert db.query(User).filter(User.supabase_user_id == "sub-xyz").count() == 1
    finally:
        db.close()


def test_missing_header_rejected(auth_enabled):
    db = SessionLocal()
    try:
        with pytest.raises(AuthError):
            get_current_user(db=db, authorization=None)
    finally:
        db.close()


def test_malformed_header_rejected(auth_enabled):
    db = SessionLocal()
    try:
        with pytest.raises(AuthError):
            get_current_user(db=db, authorization="Token abc")
    finally:
        db.close()


def test_wrong_secret_rejected(auth_enabled):
    db = SessionLocal()
    try:
        bad = _make_token(secret="attacker-secret")
        with pytest.raises(AuthError):
            get_current_user(db=db, authorization=f"Bearer {bad}")
    finally:
        db.close()


def test_wrong_audience_rejected(auth_enabled):
    db = SessionLocal()
    try:
        bad_aud = _make_token(aud="some-other-audience")
        with pytest.raises(AuthError):
            get_current_user(db=db, authorization=f"Bearer {bad_aud}")
    finally:
        db.close()


def test_expired_token_rejected(auth_enabled):
    db = SessionLocal()
    try:
        payload = {"sub": "s", "aud": "authenticated", "exp": 1}  # 1970
        token = jwt.encode(payload, _TEST_SECRET, algorithm="HS256")
        with pytest.raises(AuthError):
            get_current_user(db=db, authorization=f"Bearer {token}")
    finally:
        db.close()


def test_misconfigured_secret_rejected(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")  # enabled but no secret
    db = SessionLocal()
    try:
        token = _make_token()
        with pytest.raises(AuthError):
            get_current_user(db=db, authorization=f"Bearer {token}")
    finally:
        db.close()
