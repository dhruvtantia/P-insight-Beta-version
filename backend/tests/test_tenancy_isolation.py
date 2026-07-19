"""
Integration tests proving multi-user data isolation when AUTH_ENABLED.

Two authenticated users must never see each other's portfolios or watchlist
items through the API. Unauthenticated requests must be rejected.
"""

import jwt
import pytest

from app.core.config import settings

_SECRET = "tenancy-isolation-test-secret-0000000000"


def _tok(sub: str) -> dict:
    token = jwt.encode(
        {"sub": sub, "email": f"{sub}@example.com", "aud": "authenticated"},
        _SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _enable_auth(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", _SECRET)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    yield


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/api/v1/portfolios/")
    assert resp.status_code == 401


def test_portfolios_are_isolated_between_users(client):
    alice = _tok("alice")
    bob = _tok("bob")

    # Alice creates a portfolio.
    created = client.post("/api/v1/portfolios/", json={"name": "Alice Fund"}, headers=alice)
    assert created.status_code == 200, created.text
    alice_pid = created.json()["id"]

    # Bob creates his own.
    created_b = client.post("/api/v1/portfolios/", json={"name": "Bob Fund"}, headers=bob)
    assert created_b.status_code == 200, created_b.text
    bob_pid = created_b.json()["id"]

    # Each sees only their own in the list.
    alice_list = client.get("/api/v1/portfolios/", headers=alice).json()
    alice_names = {p["name"] for p in alice_list["portfolios"]}
    assert alice_names == {"Alice Fund"}

    bob_list = client.get("/api/v1/portfolios/", headers=bob).json()
    bob_names = {p["name"] for p in bob_list["portfolios"]}
    assert bob_names == {"Bob Fund"}

    # Bob cannot read Alice's portfolio by id (scoped → 404).
    assert client.get(f"/api/v1/portfolios/{alice_pid}", headers=bob).status_code == 404
    # Alice can read her own.
    assert client.get(f"/api/v1/portfolios/{alice_pid}", headers=alice).status_code == 200

    # Bob cannot activate, rename, or delete Alice's portfolio.
    assert client.post(f"/api/v1/portfolios/{alice_pid}/activate", headers=bob).status_code == 404
    assert client.patch(
        f"/api/v1/portfolios/{alice_pid}/rename", json={"name": "hacked"}, headers=bob
    ).status_code == 404
    assert client.delete(f"/api/v1/portfolios/{alice_pid}", headers=bob).status_code == 404

    # Alice's activation must not disturb Bob's active portfolio.
    client.post(f"/api/v1/portfolios/{alice_pid}/activate", headers=alice)
    client.post(f"/api/v1/portfolios/{bob_pid}/activate", headers=bob)
    assert client.get("/api/v1/portfolios/", headers=alice).json()["active_id"] == alice_pid
    assert client.get("/api/v1/portfolios/", headers=bob).json()["active_id"] == bob_pid


def test_watchlist_is_isolated_between_users(client):
    alice = _tok("alice")
    bob = _tok("bob")

    # Both watch the same ticker — allowed under per-user uniqueness.
    ra = client.post("/api/v1/watchlist/", json={"ticker": "TCS"}, headers=alice)
    rb = client.post("/api/v1/watchlist/", json={"ticker": "TCS"}, headers=bob)
    assert ra.status_code == 200, ra.text
    assert rb.status_code == 200, rb.text

    # Alice adds a second ticker only she should see.
    client.post("/api/v1/watchlist/", json={"ticker": "INFY"}, headers=alice)

    alice_tickers = {i["ticker"] for i in client.get("/api/v1/watchlist/", headers=alice).json()}
    bob_tickers = {i["ticker"] for i in client.get("/api/v1/watchlist/", headers=bob).json()}
    assert alice_tickers == {"TCS", "INFY"}
    assert bob_tickers == {"TCS"}

    # Bob deleting "his" TCS must not remove Alice's TCS.
    assert client.delete("/api/v1/watchlist/TCS", headers=bob).status_code == 200
    assert {i["ticker"] for i in client.get("/api/v1/watchlist/", headers=alice).json()} == {"TCS", "INFY"}
