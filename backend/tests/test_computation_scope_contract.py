"""Database/provider/HTTP integration for private computation identities."""

import secrets
import time
from datetime import date, timedelta
from types import SimpleNamespace

import jwt
import pytest

from app.analytics import quant_service
from app.core.config import settings
from app.data_providers.live_provider import LiveAPIProvider
from app.data_providers.uploaded_provider import UploadedPortfolioProvider
from app.db.database import SessionLocal
from app.ingestion.sector_enrichment import EnrichmentRecord
from app.models.portfolio import Holding, Portfolio
from app.models.user import User
from app.optimization.optimizer_service import OptimizerService
from app.services.computation_cache import computation_generation
from app.services.portfolio_manager import PortfolioManagerService
from app.services.price_enrichment_service import persist_price_outcomes
from app.services.upload_v2_service import pre_warm_uploaded_quant_cache


def _history():
    return [{"date": (date(2025, 1, 1) + timedelta(days=i)).isoformat(), "close": 100 + i}
            for i in range(45)]


@pytest.fixture
def cache_accounts(monkeypatch):
    import app.data_providers.live_provider as live_provider

    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", False)
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    secret = secrets.token_hex(32)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", secret)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUD", "authenticated")
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://auth.example.invalid")

    async def history(self, ticker, period="1y", interval="1d"):
        return {"data": _history(), "source": "synthetic"}

    monkeypatch.setattr(UploadedPortfolioProvider, "get_price_history", history)
    monkeypatch.setattr(LiveAPIProvider, "get_price_history", history)
    monkeypatch.setattr(quant_service.bm, "get_benchmark", lambda mode, period: {
        "ticker": "TESTINDEX", "name": "Synthetic benchmark", "source": "synthetic", "data": _history(),
    })
    users, portfolios = {}, {}
    with SessionLocal() as db:
        for account, active in [("first", True), ("first", False), ("second", True)]:
            if account not in users:
                user = User(supabase_user_id=f"cache-{account}")
                db.add(user)
                db.flush()
                users[account] = user.id
            portfolio = Portfolio(name="Synthetic cache portfolio", source="uploaded",
                                  user_id=users[account], is_active=active)
            db.add(portfolio)
            db.flush()
            portfolios[(account, active)] = portfolio.id
            for ticker in ["TESTA", "TESTB", "TESTC"]:
                db.add(Holding(portfolio_id=portfolio.id, ticker=ticker, name=ticker,
                               quantity=1, average_cost=90, current_price=100,
                               price_status="uploaded_current_price"))
        db.commit()

    def headers(account):
        now = int(time.time())
        token = jwt.encode(
            {"sub": f"cache-{account}", "aud": "authenticated", "iat": now, "exp": now + 300,
             "iss": "https://auth.example.invalid/auth/v1", "role": "authenticated"},
            secret, algorithm="HS256",
        )
        return {"Authorization": f"Bearer {token}"}

    return SimpleNamespace(users=users, portfolios=portfolios, headers=headers)


@pytest.mark.asyncio
@pytest.mark.parametrize("provider_type", [UploadedPortfolioProvider, LiveAPIProvider])
async def test_real_provider_scope_tracks_selection_and_clears_when_empty(cache_accounts, provider_type):
    owner = cache_accounts.users["first"]
    with SessionLocal() as db:
        provider = provider_type(db=db, user_id=owner)
        assert provider.computation_cache_scope is None
        await provider.get_holdings()
        scope = provider.computation_cache_scope
        assert scope.owner_id == owner
        assert scope.portfolio_id == cache_accounts.portfolios[("first", True)]
        manager = PortfolioManagerService(db, user_id=owner)
        replacement = cache_accounts.portfolios[("first", False)]
        manager.activate(replacement)
        await provider.get_holdings()
        assert provider.computation_cache_scope.portfolio_id == replacement
        manager.delete(replacement)
        manager.delete(cache_accounts.portfolios[("first", True)])
        assert await provider.get_holdings() == []
        assert provider.computation_cache_scope is None


@pytest.mark.asyncio
async def test_explicit_portfolio_provider_scope_stays_owner_filtered(cache_accounts):
    with SessionLocal() as db:
        provider = UploadedPortfolioProvider(db=db, user_id=cache_accounts.users["first"],
                                            portfolio_id=cache_accounts.portfolios[("second", True)])
        assert await provider.get_holdings() == []
        assert provider.computation_cache_scope is None


@pytest.mark.asyncio
@pytest.mark.parametrize("provider_type", [UploadedPortfolioProvider, LiveAPIProvider])
async def test_reused_db_provider_rereads_persisted_holdings(cache_accounts, provider_type):
    with SessionLocal() as db:
        provider = provider_type(db=db, user_id=cache_accounts.users["first"])
        assert (await provider.get_holdings())[0].quantity == 1
        with SessionLocal() as writer:
            writer.query(Holding).filter(
                Holding.portfolio_id == cache_accounts.portfolios[("first", True)]
            ).update({Holding.quantity: 2})
            writer.commit()
        assert (await provider.get_holdings())[0].quantity == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["activate", "rename", "delete", "save", "refresh", "manual", "enrichment", "prices"])
async def test_supported_mutations_advance_private_cache_generation(cache_accounts, mutation):
    owner = cache_accounts.users["first"]
    portfolio_id = cache_accounts.portfolios[("first", True)]
    with SessionLocal() as db:
        manager = PortfolioManagerService(db, user_id=owner)
        holdings = await UploadedPortfolioProvider(db=db, user_id=owner).get_holdings()
        before = computation_generation()
        if mutation == "activate":
            manager.activate(cache_accounts.portfolios[("first", False)])
        elif mutation == "rename":
            manager.rename(portfolio_id, "Synthetic rename")
        elif mutation == "delete":
            manager.delete(portfolio_id)
        elif mutation == "save":
            manager.save_uploaded_portfolio(holdings, "synthetic.csv")
        elif mutation == "refresh":
            manager.refresh_portfolio(portfolio_id, holdings, "synthetic.csv")
        elif mutation == "manual":
            manager.create_manual("Synthetic empty")
        elif mutation == "enrichment":
            manager.patch_holdings_enrichment(portfolio_id, [EnrichmentRecord("TESTA", "TESTA")])
        else:
            persist_price_outcomes(db=db, portfolio_id=portfolio_id,
                                   requested_tickers=["TESTA"], prices={"TESTA": 110})
        assert computation_generation() > before


@pytest.mark.asyncio
async def test_identical_holdings_refresh_changes_interim_revision_token(cache_accounts):
    with SessionLocal() as db:
        owner = cache_accounts.users["first"]
        provider = UploadedPortfolioProvider(db=db, user_id=owner)
        holdings = await provider.get_holdings()
        before = provider.computation_cache_scope
        PortfolioManagerService(db, user_id=owner).refresh_portfolio(before.portfolio_id, holdings, "same.csv")
        await provider.get_holdings()
        after = provider.computation_cache_scope
        assert after.portfolio_id == before.portfolio_id
        assert after.revision != before.revision


@pytest.mark.asyncio
async def test_background_prewarm_uses_same_owner_and_portfolio_identity(cache_accounts, monkeypatch):
    seen = []

    async def capture(provider, period):
        await provider.get_holdings()
        seen.append(provider.computation_cache_scope)

    monkeypatch.setattr(quant_service, "pre_warm_cache", capture)
    portfolio_id = cache_accounts.portfolios[("first", True)]
    await pre_warm_uploaded_quant_cache(SessionLocal, portfolio_id)
    assert len(seen) == 1
    assert seen[0].owner_id == cache_accounts.users["first"]
    assert seen[0].portfolio_id == portfolio_id


@pytest.mark.parametrize("mode", ["uploaded", "live"])
@pytest.mark.parametrize("endpoint", ["optimization", "quant"])
def test_authenticated_http_caches_remain_private(client, cache_accounts, monkeypatch, mode, endpoint):
    async def synthetic_solve(self, *args, **kwargs):
        return {"meta": {"cached": False, "error": None,
                         "synthetic_owner": self.provider.computation_cache_scope.owner_id}}

    monkeypatch.setattr(OptimizerService, "_compute", synthetic_solve)
    results = [client.get(f"/api/v1/{endpoint}/status?mode={mode}",
                          headers=cache_accounts.headers(account))
               for account in ["first", "second", "first"]]
    assert [response.status_code for response in results] == [200, 200, 200]
    assert [response.json()["cached"] for response in results] == [False, False, True]
    if endpoint == "optimization":
        assert [response.json()["synthetic_owner"] for response in results] == [
            cache_accounts.users["first"], cache_accounts.users["second"], cache_accounts.users["first"],
        ]
