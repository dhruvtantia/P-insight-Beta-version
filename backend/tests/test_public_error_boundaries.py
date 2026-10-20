"""Synthetic failure injection: public reasons must not echo infrastructure text."""

import json
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from app.db.database import SessionLocal
from app.models.portfolio import Holding, Portfolio
from app.schemas.broker import BrokerConnectionMeta
from app.schemas.portfolio import HoldingBase
from app.schemas.upload_v2 import HoldingEnrichmentStatus
from app.services import history_service, upload_file_utils

PRIVATE_DETAIL = "fixture-password=private /private/fixture.db https://private.example.invalid?key=fixture"
CSV = b"ticker,quantity,average_cost\nTCS,10,1000\n"


@pytest.mark.parametrize("route", [
    "/api/v1/upload/confirm", "/api/v1/upload/v2/confirm", "/api/v1/portfolios/1/refresh",
])
@pytest.mark.parametrize("mapping", ["[]", "null", "42", '"fixture"',
    '{"ticker":[],"quantity":"quantity","average_cost":"average_cost"}',
    '{"ticker":"ticker","quantity":{},"average_cost":"average_cost"}',
    '{"ticker":"ticker","quantity":"quantity","average_cost":10}',
])
def test_invalid_mapping_shapes_are_client_errors_before_any_import(client, route, mapping):
    response = client.post(route, files={"file": ("fixture.csv", CSV, "text/csv")},
                           data={"column_mapping": mapping})
    assert response.status_code == 422
    assert "column_mapping" in response.json()["detail"]
    with SessionLocal() as db:
        assert db.query(Portfolio).count() == 0


def test_file_reader_failure_is_sanitized_and_temporary_file_removed(monkeypatch):
    paths = []

    def failure(path):
        paths.append(Path(path))
        raise RuntimeError(PRIVATE_DETAIL)

    monkeypatch.setattr(upload_file_utils, "read_file_as_dataframe", failure)
    with pytest.raises(upload_file_utils.UploadServiceError) as error:
        upload_file_utils.load_dataframe_from_upload("fixture.csv", CSV)
    assert error.value.status_code == 422
    assert PRIVATE_DETAIL not in error.value.detail
    assert paths and all(not path.exists() for path in paths)


@pytest.mark.parametrize("module_name", ["app.ingestion.normalizer", "app.services.upload_v2_service"])
def test_row_model_failure_does_not_echo_exception(monkeypatch, module_name):
    import importlib
    module = importlib.import_module(module_name)

    def failure(**kwargs):
        raise ValueError(PRIVATE_DETAIL)

    monkeypatch.setattr(module, "HoldingBase", failure)
    frame = pd.DataFrame([{"ticker": "TCS", "quantity": 10, "average_cost": 1000}])
    mapping = {"ticker": "ticker", "quantity": "quantity", "average_cost": "average_cost"}
    if module_name.endswith("normalizer"):
        _, rejected = module.normalize_to_holdings(frame, mapping)
    else:
        _, rejected, _ = module.classify_rows_v2(frame, mapping)
    assert rejected
    assert PRIVATE_DETAIL not in str(rejected)


@pytest.mark.parametrize("route", [
    "/api/v1/upload/status?portfolio_id={id}", "/api/v1/upload/v2/status/{id}",
    "/api/v1/portfolios/{id}/holdings/status", "/api/v1/portfolio/full?mode=uploaded",
])
def test_saved_legacy_holding_failures_are_sanitized_without_rewriting_data(
    client, seed_uploaded_portfolio, route,
):
    portfolio = seed_uploaded_portfolio()
    with SessionLocal() as db:
        holding = db.query(Holding).filter_by(portfolio_id=portfolio.id).first()
        holding.failure_reason = PRIVATE_DETAIL
        holding.price_failure_reason = PRIVATE_DETAIL
        holding.enrichment_status = "failed"
        holding_id = holding.id
        db.commit()
    response = client.get(route.format(id=portfolio.id))
    assert response.status_code == 200
    assert PRIVATE_DETAIL not in response.text
    assert "fixture-password" not in response.text
    with SessionLocal() as db:
        assert db.get(Holding, holding_id).failure_reason == PRIVATE_DETAIL
        assert db.get(Holding, holding_id).price_failure_reason == PRIVATE_DETAIL


def test_status_model_sanitizes_legacy_reasons_but_preserves_state():
    result = HoldingEnrichmentStatus(
        ticker="TCS", enrichment_status="failed", fundamentals_status="unavailable",
        failure_reason=PRIVATE_DETAIL, price_failure_reason=PRIVATE_DETAIL,
    )
    assert PRIVATE_DETAIL not in result.model_dump_json()
    assert result.enrichment_status == "failed"
    assert result.failure_reason
    assert result.price_failure_reason


def test_broker_status_model_sanitizes_saved_failure():
    result = BrokerConnectionMeta(portfolio_id=1, connection_state="error", sync_error=PRIVATE_DETAIL)
    assert PRIVATE_DETAIL not in result.model_dump_json()
    assert result.connection_state == "error"
    assert result.sync_error


def test_history_status_sanitizes_old_store_values_without_mutating_store():
    history_service._HISTORY_BUILD_STATUS.set_status(999, "failed", error=PRIVATE_DETAIL)
    result = history_service.get_history_build_status(999)
    assert PRIVATE_DETAIL not in json.dumps(result)
    assert result["status"] == "failed"
    assert history_service._HISTORY_BUILD_STATUS.get_status(999)["error"] == PRIVATE_DETAIL


def test_history_failure_publishes_and_stores_safe_reason(monkeypatch):
    import yfinance

    def failure(*args, **kwargs):
        raise RuntimeError(PRIVATE_DETAIL)

    monkeypatch.setattr(yfinance, "download", failure)
    holding = HoldingBase(ticker="TCS", name="TCS", quantity=10, average_cost=1000)
    result = history_service.build_and_store_portfolio_history(999, [holding], lambda: None)
    assert result["error"]
    assert PRIVATE_DETAIL not in json.dumps(result)
    assert PRIVATE_DETAIL not in json.dumps(history_service._HISTORY_BUILD_STATUS.get_status(999))


def test_price_failure_is_sanitized_before_persist(seed_uploaded_portfolio):
    from app.services.price_enrichment_service import persist_price_outcomes

    portfolio = seed_uploaded_portfolio()
    with SessionLocal() as db:
        persist_price_outcomes(db=db, portfolio_id=portfolio.id, requested_tickers=["TCS"],
                               prices={}, failure_reason=PRIVATE_DETAIL)
        assert db.query(Holding).filter_by(portfolio_id=portfolio.id, ticker="TCS").one().price_failure_reason != PRIVATE_DETAIL


@pytest.mark.parametrize("raw", [PRIVATE_DETAIL, "RuntimeError: private", "provider timed out: private", {}, [], 42])
def test_unknown_saved_reasons_cannot_pass_by_prefix_or_string_conversion(raw):
    from app.core.public_errors import FailureReason, public_reason
    assert public_reason(raw, FailureReason.ENRICHMENT_FAILED) == FailureReason.ENRICHMENT_FAILED.value


@pytest.mark.parametrize("raw", [None, "", "yfinance unavailable", "fundamentals_unavailable"])
def test_approved_legacy_reasons_and_empty_values_remain_meaningful(raw):
    from app.core.public_errors import FailureReason, public_reason
    assert public_reason(raw, FailureReason.ENRICHMENT_FAILED) == (raw or None)


@pytest.mark.parametrize("boundary", ["legacy", "v2"])
def test_upload_database_failure_uses_static_service_error(monkeypatch, boundary):
    from app.services import upload_confirm_service, upload_v2_service

    def failure(*args, **kwargs):
        raise RuntimeError(PRIVATE_DETAIL)

    monkeypatch.setattr("app.services.portfolio_manager.PortfolioManagerService.save_uploaded_portfolio", failure)
    holding = HoldingBase(ticker="TCS", name="TCS", quantity=10, average_cost=1000)
    function = upload_confirm_service._persist_legacy_base_portfolio if boundary == "legacy" else upload_v2_service._persist_v2_base_portfolio
    with pytest.raises(upload_file_utils.UploadServiceError) as error:
        function([holding], "fixture.csv", user_id=None)
    assert error.value.status_code == 500
    assert error.value.detail == "Could not save portfolio to database."


@pytest.fixture
def failed_market(monkeypatch):
    import yfinance
    from app.data_providers import live_provider

    def failure(*args, **kwargs):
        raise RuntimeError(PRIVATE_DETAIL)

    monkeypatch.setattr(yfinance, "Ticker", failure)
    monkeypatch.setattr(yfinance, "download", failure)
    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", True)
    monkeypatch.setattr(live_provider, "_fund_from_cache", lambda ticker: None)
    return failure


@pytest.mark.parametrize("boundary", ["market_index", "movers", "overview", "live_indices", "benchmark"])
def test_market_and_benchmark_failures_are_sanitized(monkeypatch, failed_market, boundary):
    from app.analytics import benchmark
    from app.api.v1.endpoints import live, market

    monkeypatch.setattr(benchmark, "_from_cache", lambda key: None)
    monkeypatch.setattr(market, "_from_cache", lambda key: None)
    if boundary == "market_index":
        result = market._fetch_single_index("FIXTURE.NS", "Fixture")
        assert result["unavailable"] is True
    elif boundary == "movers":
        result = market._fetch_gainers_losers()
        assert result[2]["status"] == "unavailable"
    elif boundary == "overview":
        monkeypatch.setattr(market, "_fetch_single_index", failed_market)
        result = market._fetch_overview()
        assert all(item["unavailable"] for item in result["main_indices"])
    elif boundary == "live_indices":
        result = live._fetch_indices_sync()
    else:
        result = benchmark.fetch_benchmark_live()
        assert result["source"] == "unavailable"
    assert "fixture-password" not in json.dumps(result)
    assert "/private/fixture.db" not in json.dumps(result)


@pytest.mark.asyncio
@pytest.mark.parametrize("boundary", ["live_history", "file_fundamentals", "file_peers"])
async def test_data_provider_failure_results_are_sanitized(monkeypatch, failed_market, boundary):
    from app.data_providers import live_provider
    from app.data_providers.file_provider import FileDataProvider

    if boundary == "live_history":
        result = await live_provider.LiveAPIProvider().get_price_history("FIXTURE.NS")
        assert result["source"] == "unavailable"
    elif boundary == "file_fundamentals":
        monkeypatch.setattr(live_provider, "_fetch_fundamentals_single", failed_market)
        result = await FileDataProvider().get_fundamentals("FIXTURE.NS")
        assert result["source"] == "unavailable"
    else:
        monkeypatch.setattr(live_provider, "_PEER_MAP", {})
        monkeypatch.setattr(live_provider, "_resolve_ticker_variants", failed_market)
        result = await FileDataProvider().get_peer_discovery("FIXTURE.NS")
        assert result["peer_discovery_status"] == "error"
    assert "fixture-password" not in json.dumps(result)


@pytest.mark.parametrize("boundary", ["news", "events"])
def test_news_and_event_failure_remain_unavailable_without_raw_text(client, monkeypatch, boundary):
    from app.core.config import settings
    from app.data_providers import live_provider
    from app.data_providers.uploaded_provider import UploadedPortfolioProvider

    async def async_failure(*args, **kwargs):
        raise RuntimeError(PRIVATE_DETAIL)

    def failure(*args, **kwargs):
        raise live_provider.NewsAPIProviderError(PRIVATE_DETAIL)

    monkeypatch.setattr(settings, "NEWS_API_KEY", "synthetic-test-key")
    monkeypatch.setattr(live_provider, "_fetch_newsapi_articles", failure)
    monkeypatch.setattr(UploadedPortfolioProvider, "get_events", async_failure)
    path = "/api/v1/news/" if boundary == "news" else "/api/v1/news/events"
    response = client.get(path + "?mode=uploaded&tickers=TCS.NS")
    assert response.status_code == 200
    assert response.json()[f"{boundary}_status"] == "unavailable"
    assert "fixture-password" not in response.text


@pytest.mark.parametrize("kind", ["http", "json"])
def test_newsapi_adapter_never_raises_raw_provider_text(monkeypatch, kind):
    import httpx
    from app.core.config import settings
    from app.data_providers import live_provider

    def get(*args, **kwargs):
        if kind == "http":
            raise RuntimeError(PRIVATE_DETAIL)
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"status": "error", "message": PRIVATE_DETAIL})

    monkeypatch.setattr(settings, "NEWS_API_KEY", "synthetic-test-key")
    monkeypatch.setattr(httpx, "get", get)
    with pytest.raises(live_provider.NewsAPIProviderError) as error:
        live_provider._fetch_newsapi_articles(["TCS.NS"])
    assert "fixture-password" not in str(error.value)


@pytest.mark.parametrize("boundary", ["service_context", "service_provider", "endpoint"])
def test_advisor_failure_preserves_fallback_without_infrastructure_details(
    client, seed_uploaded_portfolio, monkeypatch, boundary,
):
    from app.core.config import settings
    from app.schemas.advisor import AdvisorQueryRequest
    from app.services import ai_advisor_service

    portfolio = seed_uploaded_portfolio()

    def failure(*args, **kwargs):
        raise RuntimeError(PRIVATE_DETAIL)

    if boundary == "endpoint":
        monkeypatch.setattr(ai_advisor_service.AIAdvisorService, "ask", failure)
        response = client.post("/api/v1/advisor/ask", json={"query": "fixture query", "portfolio_id": portfolio.id})
        assert response.status_code == 200
        result = response.json()
    else:
        with SessionLocal() as db:
            service = ai_advisor_service.AIAdvisorService(db)
            if boundary == "service_context":
                monkeypatch.setattr(service.builder, "build", failure)
            else:
                monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "synthetic-test-key")
                monkeypatch.setattr(ai_advisor_service, "_call_anthropic", failure)
            result = service.ask(AdvisorQueryRequest(query="fixture query", portfolio_id=portfolio.id, include_optimization=False)).model_dump()
    assert result["fallback_used"] is True
    assert result["error_message"]
    assert "fixture-password" not in json.dumps(result, default=str)


@pytest.mark.asyncio
async def test_optimizer_exception_is_not_a_public_reason():
    from app.optimization.optimizer_service import OptimizerService

    class BrokenProvider:
        mode_name = "uploaded"
        async def get_holdings(self):
            raise RuntimeError(PRIVATE_DETAIL)

    result = await OptimizerService(BrokenProvider()).compute()
    assert result["meta"]["error"]
    assert "fixture-password" not in json.dumps(result)


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_remote_diagnostics_remain_denied_after_user_dependency_resolves(client, monkeypatch, environment):
    from app.core.auth import get_current_user
    from app.core.config import settings
    from app.main import app

    monkeypatch.setattr(settings, "APP_ENV", environment)
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: SimpleNamespace(id=123))
    assert client.get("/api/v1/system/diagnostics").status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("boundary", ["file_provider", "live_provider", "http"])
@pytest.mark.parametrize("cached", [False, True])
async def test_fundamentals_error_data_is_sanitized_even_without_an_exception(client, monkeypatch, boundary, cached):
    from app.data_providers import live_provider
    from app.data_providers.file_provider import FileDataProvider

    payload = {"source": "unavailable", "error": PRIVATE_DETAIL, "pe_ratio": None}
    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", True)
    monkeypatch.setattr(live_provider, "_fund_from_cache", lambda ticker: payload if cached else None)
    monkeypatch.setattr(live_provider, "_fetch_fundamentals_single", lambda ticker: payload)
    monkeypatch.setattr(live_provider, "_store_fund", lambda *args: None)
    if boundary == "http":
        from app.api.v1.endpoints import live
        monkeypatch.setattr(live, "_fund_from_cache", lambda ticker: payload if cached else None)
        monkeypatch.setattr(live, "_fetch_fundamentals_single", lambda ticker: payload)
        monkeypatch.setattr(live, "_store_fund", lambda *args: None)
        response = client.get("/api/v1/live/fundamentals?ticker=FIXTURE.NS")
        assert response.status_code == 200
        result = response.json()
    else:
        provider = FileDataProvider() if boundary == "file_provider" else live_provider.LiveAPIProvider()
        result = await provider.get_fundamentals("FIXTURE.NS")
    assert result["source"] == "unavailable"
    assert result["error"]
    assert "fixture-password" not in json.dumps(result)
    assert payload["error"] == PRIVATE_DETAIL


@pytest.mark.parametrize("kind", ["reported", "scaffolded", "unexpected"])
def test_broker_connect_does_not_store_or_return_raw_failure(seed_uploaded_portfolio, monkeypatch, kind):
    from app.connectors.base import ConnectionResult, ConnectorNotConfiguredError
    from app.models.broker_connection import BrokerConnection
    from app.schemas.broker import ConnectRequest
    from app.services import broker_service

    portfolio = seed_uploaded_portfolio()

    def connect(config):
        if kind == "scaffolded":
            raise ConnectorNotConfiguredError("fixture", PRIVATE_DETAIL)
        if kind == "unexpected":
            raise RuntimeError(PRIVATE_DETAIL)
        return ConnectionResult(success=False, error=PRIVATE_DETAIL)

    monkeypatch.setattr(broker_service, "get_connector", lambda name: SimpleNamespace(connect=connect))
    with SessionLocal() as db:
        service = broker_service.BrokerService(db)
        request = ConnectRequest(broker_name="zerodha")
        if kind == "unexpected":
            with pytest.raises(RuntimeError):
                service.connect(portfolio.id, request)
        else:
            response = service.connect(portfolio.id, request)
            assert response.success is False
            assert "fixture-password" not in response.model_dump_json()
        row = db.query(BrokerConnection).filter_by(portfolio_id=portfolio.id).one()
        assert row.sync_error
        assert "fixture-password" not in row.sync_error


@pytest.mark.parametrize("kind", ["reported", "scaffolded", "unexpected"])
def test_failed_broker_sync_cannot_replace_holdings_or_expose_raw_reason(seed_uploaded_portfolio, monkeypatch, kind):
    from app.connectors.base import SyncResult, ConnectorNotConfiguredError, ConnectorSyncError
    from app.models.broker_connection import BrokerConnection
    from app.services import broker_service

    portfolio = seed_uploaded_portfolio()

    def sync(config):
        if kind == "scaffolded":
            raise ConnectorNotConfiguredError("fixture", PRIVATE_DETAIL)
        if kind == "unexpected":
            raise RuntimeError(PRIVATE_DETAIL)
        return SyncResult(error=PRIVATE_DETAIL)

    def must_not_refresh(*args, **kwargs):
        pytest.fail("Failed sync must not replace holdings")

    monkeypatch.setattr(broker_service, "get_connector", lambda name: SimpleNamespace(sync_holdings=sync))
    monkeypatch.setattr("app.services.portfolio_manager.PortfolioManagerService.refresh_portfolio", must_not_refresh)
    with SessionLocal() as db:
        db.add(BrokerConnection(portfolio_id=portfolio.id, broker_name="zerodha", connection_state="connected"))
        db.commit()
        before = [(h.id, h.quantity, h.average_cost) for h in db.query(Holding).filter_by(portfolio_id=portfolio.id).all()]
        service = broker_service.BrokerService(db)
        if kind == "scaffolded":
            result = service.sync(portfolio.id)
            assert result.success is False
            assert "fixture-password" not in result.model_dump_json()
        else:
            with pytest.raises(ConnectorSyncError if kind == "reported" else RuntimeError):
                service.sync(portfolio.id)
        row = db.query(BrokerConnection).filter_by(portfolio_id=portfolio.id).one()
        assert row.sync_error
        assert "fixture-password" not in row.sync_error
        assert [(h.id, h.quantity, h.average_cost) for h in db.query(Holding).filter_by(portfolio_id=portfolio.id).all()] == before


@pytest.mark.parametrize("route", ["/api/v1/analytics/ratios?mode=uploaded", "/api/v1/peers/TCS.NS?mode=uploaded"])
def test_raw_provider_reason_in_dict_is_not_forwarded_through_analytics(client, monkeypatch, seed_uploaded_portfolio, route):
    from app.data_providers.uploaded_provider import UploadedPortfolioProvider

    seed_uploaded_portfolio()

    async def failure_data(self, ticker):
        return {"source": "unavailable", "error": PRIVATE_DETAIL}

    monkeypatch.setattr(UploadedPortfolioProvider, "get_fundamentals", failure_data)
    response = client.get(route)
    assert response.status_code == 200
    assert "fixture-password" not in response.text


def test_enrichment_patch_and_public_record_share_safe_reason_policy(seed_uploaded_portfolio):
    from app.ingestion.sector_enrichment import EnrichmentRecord
    from app.services.portfolio_manager import PortfolioManagerService

    portfolio = seed_uploaded_portfolio()
    record = EnrichmentRecord(ticker="TCS", normalized_ticker="TCS.NS", enrichment_reason=PRIVATE_DETAIL)
    assert "fixture-password" not in json.dumps(record.to_dict())
    with SessionLocal() as db:
        PortfolioManagerService(db).patch_holdings_enrichment(portfolio.id, [record])
        holding = db.query(Holding).filter_by(portfolio_id=portfolio.id, ticker="TCS").one()
        assert holding.enrichment_reason
        assert "fixture-password" not in holding.enrichment_reason
        assert holding.failure_reason == holding.enrichment_reason
