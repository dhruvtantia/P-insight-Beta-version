"""Upload-progress access contracts using synthetic accounts and locally signed tokens."""

import secrets
import time
from types import SimpleNamespace

import jwt
import pytest

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.portfolio import Holding, Portfolio
from app.models.user import User
from app.services import job_status_service
from app.services.job_status_service import JobStatusNotFoundError, JobStatusService


STATUS_URLS = [
    "/api/v1/upload/status?portfolio_id={portfolio_id}",
    "/api/v1/upload/v2/status/{portfolio_id}",
]


@pytest.fixture
def progress_accounts():
    with SessionLocal() as db:
        first = User(supabase_user_id="progress-first")
        second = User(supabase_user_id="progress-second")
        db.add_all([first, second])
        db.flush()
        portfolios = {}
        for key, owner in [("first", first.id), ("second", second.id), ("legacy", None)]:
            portfolio = Portfolio(name=f"Synthetic {key}", source="uploaded", user_id=owner)
            db.add(portfolio)
            db.flush()
            db.add(Holding(
                portfolio_id=portfolio.id,
                ticker=f"TEST_{key.upper()}",
                name=f"Synthetic {key} holding",
                quantity=1,
                average_cost=100,
                enrichment_status="pending",
            ))
            portfolios[key] = portfolio.id
        empty = Portfolio(name="Synthetic empty", source="uploaded", user_id=first.id)
        db.add(empty)
        db.flush()
        portfolios["empty"] = empty.id
        result = SimpleNamespace(
            portfolios=portfolios, users={"first": first.id, "second": second.id}
        )
        db.commit()
        return result


@pytest.fixture
def progress_auth(monkeypatch):
    secret = secrets.token_hex(32)
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", secret)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://auth.example.invalid")

    def headers(account="first"):
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": f"progress-{account}",
                "aud": "authenticated",
                "iss": "https://auth.example.invalid/auth/v1",
                "iat": now,
                "exp": now + 300,
                "role": "authenticated",
            },
            secret,
            algorithm="HS256",
        )
        return {"Authorization": f"Bearer {token}"}

    return headers


@pytest.mark.parametrize("url", STATUS_URLS)
@pytest.mark.parametrize("account", ["first", "second"])
def test_progress_routes_return_only_owned_status(client, progress_accounts, progress_auth, url, account):
    portfolio_id = progress_accounts.portfolios[account]
    response = client.get(url.format(portfolio_id=portfolio_id), headers=progress_auth(account))

    assert response.status_code == 200
    payload = response.json()
    assert payload["portfolio_id"] == portfolio_id
    assert payload["total_holdings"] == 1
    assert payload["pending"] == 1
    assert payload["overall"] == "in_progress"
    assert [holding["ticker"] for holding in payload["holdings"]] == [f"TEST_{account.upper()}"]


@pytest.mark.parametrize("url", STATUS_URLS)
@pytest.mark.parametrize("resource", ["second", "legacy", "missing"])
def test_progress_routes_hide_unavailable_resources(
    client, progress_accounts, progress_auth, monkeypatch, url, resource
):
    def unexpected_status_read(*args, **kwargs):
        raise AssertionError("Status details must not be read before ownership is established")

    monkeypatch.setattr(job_status_service, "get_enrichment_status", unexpected_status_read)
    portfolio_id = progress_accounts.portfolios.get(resource, 999999)
    response = client.get(url.format(portfolio_id=portfolio_id), headers=progress_auth())

    assert response.status_code == 404
    assert response.json() == {"detail": f"Portfolio {portfolio_id} not found"}


@pytest.mark.parametrize("url", STATUS_URLS)
@pytest.mark.parametrize("authorization", [None, "NotBearer token", "Bearer invalid-local-token"])
def test_progress_routes_require_authentication(
    client, progress_accounts, progress_auth, monkeypatch, url, authorization
):
    def unexpected_service_read(*args, **kwargs):
        raise AssertionError("Unauthenticated requests must not reach the status service")

    monkeypatch.setattr(JobStatusService, "get_upload_enrichment_status", unexpected_service_read)
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.get(
        url.format(portfolio_id=progress_accounts.portfolios["first"]), headers=headers
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("url", STATUS_URLS)
def test_progress_routes_sanitize_unexpected_errors(
    client, progress_accounts, progress_auth, monkeypatch, url
):
    def unavailable(*args, **kwargs):
        raise RuntimeError("synthetic-private-database-detail")

    monkeypatch.setattr(job_status_service, "get_enrichment_status", unavailable)
    response = client.get(
        url.format(portfolio_id=progress_accounts.portfolios["first"]), headers=progress_auth()
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Could not read enrichment status"}
    assert "synthetic-private-database-detail" not in response.text


@pytest.mark.parametrize("url", STATUS_URLS)
def test_progress_routes_accept_owned_empty_portfolio(client, progress_accounts, progress_auth, url):
    portfolio_id = progress_accounts.portfolios["empty"]
    response = client.get(url.format(portfolio_id=portfolio_id), headers=progress_auth())

    assert response.status_code == 200
    assert response.json()["portfolio_id"] == portfolio_id
    assert response.json()["total_holdings"] == 0
    assert response.json()["holdings"] == []


def test_progress_route_variants_have_identical_owned_response(client, progress_accounts, progress_auth):
    responses = [
        client.get(
            url.format(portfolio_id=progress_accounts.portfolios["first"]), headers=progress_auth()
        )
        for url in STATUS_URLS
    ]
    assert all(response.status_code == 200 for response in responses)
    assert responses[0].json() == responses[1].json()


@pytest.mark.parametrize("account", ["first", "second"])
def test_progress_service_reads_owned_status(progress_accounts, account):
    with SessionLocal() as db:
        result = JobStatusService(db).get_upload_enrichment_status(
            progress_accounts.portfolios[account], user_id=progress_accounts.users[account]
        )
    assert result.portfolio_id == progress_accounts.portfolios[account]
    assert [holding.ticker for holding in result.holdings] == [f"TEST_{account.upper()}"]


@pytest.mark.parametrize("resource", ["second", "legacy", "missing"])
def test_progress_service_checks_owner_before_reading_details(progress_accounts, monkeypatch, resource):
    def unexpected_status_read(*args, **kwargs):
        raise AssertionError("Status details must not be read before ownership is established")

    monkeypatch.setattr(job_status_service, "get_enrichment_status", unexpected_status_read)
    portfolio_id = progress_accounts.portfolios.get(resource, 999999)
    with SessionLocal() as db:
        with pytest.raises(JobStatusNotFoundError, match=f"^Portfolio {portfolio_id} not found$"):
            JobStatusService(db).get_upload_enrichment_status(
                portfolio_id, user_id=progress_accounts.users["first"]
            )


def test_progress_service_requires_explicit_owner_context(progress_accounts):
    with SessionLocal() as db:
        with pytest.raises(TypeError, match="user_id"):
            JobStatusService(db).get_upload_enrichment_status(progress_accounts.portfolios["first"])


@pytest.mark.parametrize("url", STATUS_URLS)
def test_progress_routes_preserve_explicit_auth_disabled_mode(client, progress_accounts, monkeypatch, url):
    monkeypatch.setattr(settings, "AUTH_ENABLED", False)
    portfolio_id = progress_accounts.portfolios["legacy"]
    response = client.get(url.format(portfolio_id=portfolio_id))

    assert response.status_code == 200
    assert response.json()["holdings"][0]["ticker"] == "TEST_LEGACY"
