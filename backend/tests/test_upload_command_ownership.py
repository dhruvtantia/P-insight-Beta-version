"""Owner contracts shared by current and compatibility upload commands."""

import inspect
import json
import secrets
import time
from itertools import product
from types import SimpleNamespace

import jwt
import pytest

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.portfolio import Holding, Portfolio
from app.models.user import User
from app.schemas.portfolio import HoldingBase
from app.services import upload_confirm_service, upload_v2_service
from app.services.portfolio_manager import PortfolioManagerService
from app.services.upload_file_utils import UploadServiceError


COMMAND_URLS = [
    "/api/v1/upload/confirm",
    "/api/v1/upload/v2/confirm",
    "/api/v1/portfolio/upload",
]
MAPPING = json.dumps({field: field for field in [
    "ticker", "name", "quantity", "average_cost", "current_price", "sector"
]})


@pytest.fixture
def upload_accounts(monkeypatch, tmp_path):
    import app.api.v1.endpoints.portfolio as portfolio_endpoint
    import app.api.v1.endpoints.upload as upload_endpoint

    async def no_background(*args, **kwargs):
        return None

    async def unchanged_prices(portfolio_id, holdings):
        return holdings

    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)
    monkeypatch.setattr(portfolio_endpoint, "UPLOADS_PATH", tmp_path)
    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", no_background)
    monkeypatch.setattr(upload_confirm_service, "enrich_holdings", lambda rows: (rows, [], 0, None))
    monkeypatch.setattr(upload_confirm_service, "_fetch_and_persist_prices", unchanged_prices)
    monkeypatch.setattr(upload_confirm_service, "_schedule_legacy_background_work", lambda *args: None)
    secret = secrets.token_hex(32)
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", secret)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")

    with SessionLocal() as db:
        users = {}
        for account in ["first", "second"]:
            user = User(supabase_user_id=f"upload-{account}")
            db.add(user)
            db.flush()
            users[account] = user.id
            for active in [False, True]:
                portfolio = Portfolio(
                    name=f"Synthetic {account} {active}", source="uploaded",
                    user_id=user.id, is_active=active,
                )
                db.add(portfolio)
                db.flush()
                db.add(Holding(
                    portfolio_id=portfolio.id, ticker=f"BASE_{account.upper()}_{int(active)}",
                    name="Synthetic baseline", quantity=2, average_cost=100,
                ))
        db.add(Portfolio(name="Synthetic unowned", source="uploaded", is_active=True))
        db.commit()

    def headers(account="first"):
        now = int(time.time())
        token = jwt.encode(
            {"sub": f"upload-{account}", "aud": "authenticated", "iat": now, "exp": now + 300},
            secret, algorithm="HS256",
        )
        return {"Authorization": f"Bearer {token}"}

    return SimpleNamespace(users=users, headers=headers, files=tmp_path)


def _database_state():
    with SessionLocal() as db:
        return {
            table: {
                row.id: {column.name: getattr(row, column.name) for column in model.__table__.columns}
                for row in db.query(model).all()
            }
            for table, model in [("portfolios", Portfolio), ("holdings", Holding)]
        }


def _post_upload(client, url, headers=None, ticker="TESTNEW", content=None, **extra_fields):
    csv = (
        "ticker,name,quantity,average_cost,current_price,sector\n"
        f"{ticker},Synthetic holding,3,100,110,Technology\n"
    ).encode()
    return client.post(
        url,
        headers=headers or {},
        files={"file": ("same-name.csv", csv if content is None else content, "text/csv")},
        data={"column_mapping": MAPPING, **extra_fields},
    )


def _assert_owned_creation(before, after, owner_id, ticker):
    new_ids = set(after["portfolios"]) - set(before["portfolios"])
    assert len(new_ids) == 1
    portfolio_id = new_ids.pop()
    created = after["portfolios"][portfolio_id]
    assert created["user_id"] == owner_id
    assert created["is_active"] is True
    assert created["source"] == "uploaded"
    for old_id, old in before["portfolios"].items():
        if old["user_id"] == owner_id:
            assert after["portfolios"][old_id]["is_active"] is False
        else:
            assert after["portfolios"][old_id] == old
    for holding_id, holding in before["holdings"].items():
        assert after["holdings"][holding_id] == holding
    assert sum(
        row["is_active"] for row in after["portfolios"].values() if row["user_id"] == owner_id
    ) == 1
    holdings = [row for row in after["holdings"].values() if row["portfolio_id"] == portfolio_id]
    assert [row["ticker"] for row in holdings] == [ticker]
    return portfolio_id


@pytest.mark.parametrize("url", COMMAND_URLS)
@pytest.mark.parametrize("account", ["first", "second"])
def test_upload_commands_create_and_activate_only_for_authenticated_owner(
    client, upload_accounts, url, account
):
    other = "second" if account == "first" else "first"
    before = _database_state()
    response = _post_upload(
        client, url, upload_accounts.headers(account), user_id=str(upload_accounts.users[other])
    )

    assert response.status_code == 200
    portfolio_id = _assert_owned_creation(
        before, _database_state(), upload_accounts.users[account], "TESTNEW"
    )
    if url.endswith("/v2/confirm"):
        assert response.json()["portfolio_id"] == portfolio_id
    else:
        assert response.json()["success"] is True
        assert response.json()["holdings_parsed"] == 1
    for identity, expected in [(account, "TESTNEW"), (other, f"BASE_{other.upper()}_1")]:
        holdings = client.get("/api/v1/portfolio/?mode=uploaded", headers=upload_accounts.headers(identity))
        assert holdings.status_code == 200
        assert [row["ticker"] for row in holdings.json()] == [expected]


@pytest.mark.parametrize("first_url,second_url", list(product(COMMAND_URLS, repeat=2)))
def test_mixed_repeated_upload_commands_preserve_owner_boundaries(
    client, upload_accounts, first_url, second_url
):
    for url, account, ticker in [
        (first_url, "first", "TESTONE"),
        (second_url, "second", "TESTTWO"),
        (first_url, "first", "TESTTHREE"),
    ]:
        before = _database_state()
        response = _post_upload(client, url, upload_accounts.headers(account), ticker=ticker)
        assert response.status_code == 200
        _assert_owned_creation(before, _database_state(), upload_accounts.users[account], ticker)


@pytest.mark.parametrize("url", COMMAND_URLS)
@pytest.mark.parametrize("authorization", [None, "NotBearer token", "Bearer invalid-local-token"])
def test_upload_commands_reject_unauthenticated_requests_without_mutation(
    client, upload_accounts, url, authorization
):
    before = _database_state()
    headers = {} if authorization is None else {"Authorization": authorization}
    response = _post_upload(client, url, headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert _database_state() == before
    assert list(upload_accounts.files.iterdir()) == []


@pytest.mark.parametrize("url", COMMAND_URLS)
def test_upload_commands_reject_invalid_input_without_activation_changes(client, upload_accounts, url):
    before = _database_state()
    response = _post_upload(client, url, upload_accounts.headers(), content=b"unmapped\ninvalid\n")

    assert response.status_code == 422
    assert _database_state() == before


@pytest.mark.parametrize("url", COMMAND_URLS)
def test_upload_commands_preserve_explicit_single_user_local_mode(
    client, upload_accounts, monkeypatch, url
):
    monkeypatch.setattr(settings, "AUTH_ENABLED", False)
    before = _database_state()
    response = _post_upload(client, url)

    assert response.status_code == 200
    after = _database_state()
    new_ids = set(after["portfolios"]) - set(before["portfolios"])
    assert len(new_ids) == 1
    created = after["portfolios"][new_ids.pop()]
    assert created["user_id"] is None
    assert created["is_active"] is True
    assert all(after["portfolios"][old_id]["is_active"] is False for old_id in before["portfolios"])


@pytest.mark.parametrize("function,args", [
    (upload_confirm_service.confirm_legacy_upload, {
        "filename": "test.csv", "content": b"", "column_mapping": MAPPING, "background_tasks": None,
    }),
    (upload_confirm_service._persist_legacy_base_portfolio, {"holdings": [], "filename": "test.csv"}),
    (upload_v2_service.confirm_upload_v2_file, {
        "filename": "test.csv", "content": b"", "column_mapping": MAPPING, "background_tasks": None,
    }),
    (upload_v2_service._persist_v2_base_portfolio, {"accepted": [], "filename": "test.csv"}),
    (upload_v2_service.persist_base_portfolio, {"holdings": [], "filename": "test.csv", "db": None}),
])
def test_upload_command_boundaries_require_explicit_owner_context(function, args):
    with pytest.raises(TypeError, match="user_id"):
        inspect.signature(function).bind(**args)


@pytest.mark.parametrize("boundary", ["manager", "legacy", "v2"])
def test_upload_persistence_rejects_unscoped_context_when_auth_enabled(upload_accounts, boundary):
    holdings = [HoldingBase(ticker="TESTNEW", name="Synthetic", quantity=1, average_cost=100)]
    before = _database_state()
    expected_error = ValueError if boundary == "manager" else UploadServiceError
    with pytest.raises(expected_error, match="owner context"):
        if boundary == "legacy":
            upload_confirm_service._persist_legacy_base_portfolio(holdings, "guard.csv", user_id=None)
        elif boundary == "v2":
            upload_v2_service._persist_v2_base_portfolio(holdings, "guard.csv", user_id=None)
        else:
            with SessionLocal() as db:
                PortfolioManagerService(db, user_id=None).save_uploaded_portfolio(holdings, "guard.csv")
    assert _database_state() == before
