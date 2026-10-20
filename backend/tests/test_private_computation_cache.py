"""Private cache identity, freshness and ownership contracts with synthetic data."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import asdict
from datetime import date, timedelta

import pytest

from app.analytics import quant_service
from app.analytics.quant_service import QuantAnalyticsService
from app.optimization import optimizer_service
from app.optimization.optimizer_service import OptimizerService
from app.optimization.types import OptimizationConstraints
from app.schemas.portfolio import HoldingBase
from app.services import cache_service


class PortfolioProvider:
    mode_name = "uploaded"

    def __init__(self, *, owner=1, portfolio=10, revision="first", identified=True):
        self.owner, self.portfolio, self.revision = owner, portfolio, revision
        self.identified = identified
        self.holdings_reads = self.history_reads = 0
        self.holdings = [HoldingBase(
            ticker=ticker, name=ticker, quantity=1, average_cost=90,
            current_price=100, price_status="live", price_source="synthetic",
        ) for ticker in ["TESTA", "TESTB", "TESTC"]]
        self.histories = {ticker: [
            {"date": (date(2025, 1, 1) + timedelta(days=i)).isoformat(), "close": 100 + i + offset * (i % 3)}
            for i in range(45)
        ] for offset, ticker in enumerate(["TESTA", "TESTB", "TESTC"])}

    @property
    def computation_cache_scope(self):
        from app.services.computation_cache import PortfolioComputationScope
        if not self.identified:
            return None
        return PortfolioComputationScope(self.owner, self.portfolio, self.revision)

    async def get_holdings(self):
        self.holdings_reads += 1
        return self.holdings

    async def get_price_history(self, ticker, period="1y", interval="1d"):
        self.history_reads += 1
        data = self.histories.get(ticker, [])
        return {"data": deepcopy(data), "source": "synthetic" if data else "unavailable"}


class CountingOptimizer(OptimizerService):
    def __init__(self, provider):
        super().__init__(provider)
        self.calls = 0
        self.fail = None

    async def _compute(self, period, er_method, cov_method, n_frontier, constraints, **snapshot):
        self.calls += 1
        if self.fail == "exception":
            raise RuntimeError("synthetic temporary failure")
        return {
            "meta": {"error": "temporary" if self.fail else None, "cached": False},
            "nested": [{"value": self.calls}], "n_points": n_frontier,
            "constraints": asdict(constraints),
            "quantity": snapshot["holdings"][0].quantity if snapshot else None,
        }


@pytest.fixture(autouse=True)
def clean_caches_and_benchmark(monkeypatch):
    optimizer_service.invalidate_cache()
    quant_service.clear_quant_caches()
    monkeypatch.setattr(quant_service.bm, "get_benchmark", lambda mode, period: {
        "ticker": "TESTINDEX", "name": "Synthetic benchmark", "source": "synthetic",
        "data": PortfolioProvider().histories["TESTA"], "period": period,
    })
    yield
    optimizer_service.invalidate_cache()
    quant_service.clear_quant_caches()


async def compute(kind, provider):
    if kind == "optimizer":
        return await CountingOptimizer(provider).compute()
    return await QuantAnalyticsService(provider).compute_all()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
@pytest.mark.parametrize("change", [{"owner": 2}, {"portfolio": 20}, {"revision": "second"}])
async def test_private_results_are_separated_by_owner_portfolio_and_revision(kind, change):
    first = await compute(kind, PortfolioProvider())
    other_provider = PortfolioProvider(**change)
    other = await compute(kind, other_provider)
    assert first["meta"]["cached"] is False
    assert other["meta"]["cached"] is False
    assert other_provider.history_reads == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
async def test_identical_inputs_hit_cache_only_after_holdings_are_resolved(kind):
    provider = PortfolioProvider()
    first = await compute(kind, provider)
    second = await compute(kind, provider)
    assert first["meta"]["cached"] is False
    assert second["meta"]["cached"] is True
    assert provider.holdings_reads == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
@pytest.mark.parametrize("field,value", [
    ("quantity", 2), ("average_cost", 80), ("current_price", 110),
    ("price_status", "uploaded_current_price"), ("price_source", "other-source"),
    ("currency", "USD"), ("name", "Different name"), ("sector", "Different sector"),
])
async def test_holdings_and_provenance_changes_miss_private_result_cache(kind, field, value):
    provider = PortfolioProvider()
    await compute(kind, provider)
    provider.holdings[0] = provider.holdings[0].model_copy(update={field: value})
    result = await compute(kind, provider)
    assert result["meta"]["cached"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("option,value", [
    ("period", "3mo"), ("expected_returns_method", "ema_mean"),
    ("covariance_method", "sample"), ("n_frontier_points", 10),
    ("long_only", False), ("min_weight", 0.1), ("max_weight", 0.6), ("fully_invested", False),
])
async def test_optimizer_key_includes_all_options_and_constraints(option, value):
    service = CountingOptimizer(PortfolioProvider())
    await service.compute()
    if option in asdict(OptimizationConstraints()):
        kwargs = {"constraints": OptimizationConstraints(**{option: value})}
    else:
        kwargs = {option: value}
    result = await service.compute(**kwargs)
    assert result["meta"]["cached"] is False
    assert service.calls == 2


@pytest.mark.asyncio
async def test_optimizer_key_includes_risk_free_rate_and_actual_history(monkeypatch):
    provider = PortfolioProvider()
    service = CountingOptimizer(provider)
    await service.compute()
    monkeypatch.setattr(optimizer_service, "RISK_FREE_RATE", 0.04)
    assert (await service.compute())["meta"]["cached"] is False
    provider.histories["TESTA"][-1]["close"] = 999
    assert (await service.compute())["meta"]["cached"] is False
    assert service.calls == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
async def test_unknown_provider_identity_disables_shared_private_caching(kind):
    provider = PortfolioProvider(identified=False)
    await compute(kind, provider)
    result = await compute(kind, provider)
    assert result["meta"]["cached"] is False
    assert provider.history_reads == 6


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
async def test_callers_cannot_mutate_nested_cached_results(kind):
    provider = PortfolioProvider()
    first = await compute(kind, provider)
    block = "nested" if kind == "optimizer" else "performance"
    first[block].clear()
    second = await compute(kind, provider)
    assert second[block]
    second[block].clear()
    assert (await compute(kind, provider))[block]


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["exception", "reported"])
async def test_optimizer_does_not_cache_temporary_failures(failure):
    service = CountingOptimizer(PortfolioProvider())
    service.fail = failure
    assert (await service.compute())["meta"]["error"]
    service.fail = None
    recovered = await service.compute()
    assert recovered["meta"]["error"] is None
    assert recovered["meta"]["cached"] is False
    assert service.calls == 2


@pytest.mark.asyncio
async def test_quant_does_not_cache_failed_or_partial_history():
    provider = PortfolioProvider()
    histories = deepcopy(provider.histories)
    provider.histories["TESTC"] = []
    failed = await compute("quant", provider)
    assert failed["meta"]["incomplete"] is True
    provider.histories = histories
    recovered = await compute("quant", provider)
    assert recovered["meta"]["incomplete"] is False
    assert recovered["meta"]["cached"] is False
    assert provider.history_reads == 6


@pytest.mark.asyncio
async def test_raw_history_is_not_shared_between_owners_with_same_tickers():
    await compute("quant", PortfolioProvider())
    other = PortfolioProvider(owner=2)
    other.holdings[0].quantity = 2
    await compute("quant", other)
    assert other.history_reads == 3


@pytest.mark.asyncio
async def test_result_does_not_outlive_raw_history_snapshot(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(cache_service.time, "time", lambda: clock[0])
    monkeypatch.setattr(cache_service.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(quant_service._RAW_HIST_CACHE, "_ttl_for_key", lambda key: 1)
    provider = PortfolioProvider()
    await compute("quant", provider)
    provider.histories["TESTA"][-1]["close"] = 999
    clock[0] += 2
    updated = await compute("quant", provider)
    assert updated["meta"]["cached"] is False
    assert provider.history_reads == 6


def test_memory_cache_has_bounded_capacity_and_monotonic_expiry(monkeypatch):
    clock = [1.0]
    monkeypatch.setattr(cache_service.time, "monotonic", lambda: clock[0])
    cache = cache_service.TimedMemoryCache(lambda key: 10, max_entries=2)
    cache.set("one", 1)
    cache.set("two", 2)
    cache.set("three", 3)
    assert cache.get("one") is None
    assert cache.get("two") == 2
    clock[0] += 11
    assert cache.get("two") is None


@pytest.mark.asyncio
async def test_mutation_fences_inflight_result_and_freezes_caller_inputs(monkeypatch):
    from app.services.computation_cache import invalidate_private_computations

    started, release = asyncio.Event(), asyncio.Event()
    provider = PortfolioProvider()
    service = CountingOptimizer(provider)
    original_fetch = service._fetch_all_histories

    async def delayed_fetch(*args):
        started.set()
        await release.wait()
        return await original_fetch(*args)

    monkeypatch.setattr(service, "_fetch_all_histories", delayed_fetch)
    constraints = OptimizationConstraints()
    pending = asyncio.create_task(service.compute(constraints=constraints))
    await asyncio.wait_for(started.wait(), timeout=2)
    constraints.max_weight = 0.6
    provider.holdings[0].quantity = 2
    invalidate_private_computations()
    release.set()
    first = await pending
    assert first["constraints"]["max_weight"] == 0.4
    assert first["quantity"] == 1
    updated = await service.compute(constraints=constraints)
    assert updated["meta"]["cached"] is False
    assert updated["quantity"] == 2
    assert (await service.compute(constraints=constraints))["meta"]["cached"] is True


@pytest.mark.asyncio
async def test_explicit_clear_invalidates_private_results_and_history():
    provider = PortfolioProvider()
    await compute("quant", provider)
    assert (await compute("quant", provider))["meta"]["cached"] is True
    quant_service.clear_quant_caches()
    assert (await compute("quant", provider))["meta"]["cached"] is False
    assert provider.history_reads == 6


@pytest.mark.asyncio
async def test_benchmark_recovery_is_not_hidden_by_result_cache(monkeypatch):
    provider = PortfolioProvider()
    baseline = quant_service.bm.get_benchmark("uploaded", "1y")
    monkeypatch.setattr(quant_service.bm, "get_benchmark", lambda *args: {
        **baseline, "data": [], "source": "unavailable", "error": "synthetic outage",
    })
    assert (await compute("quant", provider))["meta"]["benchmark_available"] is False
    monkeypatch.setattr(quant_service.bm, "get_benchmark", lambda *args: baseline)
    recovered = await compute("quant", provider)
    assert recovered["meta"]["benchmark_available"] is True
    assert recovered["meta"]["cached"] is False
    baseline["data"][-1]["close"] = 999
    assert (await compute("quant", provider))["meta"]["cached"] is False


def test_generation_and_memory_cache_are_safe_across_threads():
    from app.services.computation_cache import computation_generation, invalidate_private_computations

    before = computation_generation()
    cache = cache_service.TimedMemoryCache(lambda key: 60, max_entries=8)

    def work(index):
        invalidate_private_computations()
        cache.set(str(index), index)
        cache.get(str(index))
        if index % 7 == 0:
            cache.clear()

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(work, range(200)))
    assert computation_generation() == before + 200
    assert len(cache._entries) <= 8


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
async def test_missing_owner_disables_private_cache_when_auth_is_enabled(kind, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    provider = PortfolioProvider(owner=None)
    await compute(kind, provider)
    assert (await compute(kind, provider))["meta"]["cached"] is False
    assert provider.history_reads == 6


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["optimizer", "quant"])
async def test_provider_declared_unavailable_is_not_cached_even_with_rows(kind, monkeypatch):
    provider = PortfolioProvider()
    original_history = provider.get_price_history

    async def unavailable(*args, **kwargs):
        return {**await original_history(*args, **kwargs), "source": "unavailable"}

    monkeypatch.setattr(provider, "get_price_history", unavailable)
    await compute(kind, provider)
    assert (await compute(kind, provider))["meta"]["cached"] is False
    assert provider.history_reads == 6


@pytest.mark.asyncio
@pytest.mark.parametrize("constant", ["RISK_FREE_RATE", "TRADING_DAYS"])
async def test_quant_policy_constants_are_part_of_identity(monkeypatch, constant):
    provider = PortfolioProvider()
    await compute("quant", provider)
    monkeypatch.setattr(quant_service, constant, getattr(quant_service, constant) + 1)
    assert (await compute("quant", provider))["meta"]["cached"] is False


def test_unserializable_or_nonfinite_input_safely_bypasses_cache():
    from app.services.computation_cache import private_computation_key

    provider = PortfolioProvider()
    provider.holdings[0].current_price = float("nan")
    assert private_computation_key("test", provider, provider.computation_cache_scope,
                                   provider.holdings, 1) is None
