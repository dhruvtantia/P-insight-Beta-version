"""Reviewed failure messages shared by producers and legacy-data read boundaries.

Do not try to redact arbitrary exception text: only approved messages may pass.
These are plain string fields on the wire, not a change to response schemas.
"""

from enum import Enum
from typing import Annotated

from pydantic import AfterValidator


class FailureReason(str, Enum):
    FILE_READ = "Could not read uploaded file. Check its format and contents."
    INVALID_ROW = "Invalid holding values. Check the required columns."
    SAVE_FAILED = "Could not save portfolio to database."
    ENRICHMENT_FAILED = "Enrichment incomplete. Check the ticker format or retry later."
    PRICE_FAILED = "Live price lookup unavailable. Retry later."
    HISTORY_FAILED = "Portfolio history could not be built. Retry later."
    PROVIDER_FAILED = "Market data provider unavailable. Retry later."
    PEERS_FAILED = "Peer discovery unavailable. Retry later."
    NEWS_FAILED = "News provider unavailable. Retry later."
    EVENTS_FAILED = "Corporate events provider unavailable. Retry later."
    BENCHMARK_FAILED = "Benchmark data unavailable. Retry later."
    OPTIMIZER_FAILED = "Optimization unavailable. Retry later."
    ADVISOR_FAILED = "Advisor unavailable. Retry later."
    CONTEXT_FAILED = "Portfolio context unavailable. Retry later."
    NO_PORTFOLIO = "Portfolio not found or unavailable."
    BROKER_FAILED = "Broker operation failed. Check the connection or retry later."
    BROKER_NOT_READY = "Broker connector is not configured or implemented."


# Exact historical, application-generated reasons; never prefixes or substrings.
_REVIEWED_REASONS = frozenset(reason.value for reason in FailureReason) | {
    "fundamentals_unavailable", "enrichment_not_reached", "yfinance unavailable",
    "yfinance returned no price", "latest live lookup returned no price",
    "live price fetch timed out after 20s", "live price fetch timed out after 25s",
    "yfinance is not installed", "live price provider is not importable",
    "yfinance not available", "no tickers", "empty yfinance response",
    "no close prices extracted", "no holding price data", "ticker mismatch after download",
    "no daily values computed", "yfinance not installed",
    "No ANTHROPIC_API_KEY in settings", "No ANTHROPIC_API_KEY or OPENAI_API_KEY in settings",
}


def public_reason(value: object, fallback: FailureReason) -> str | None:
    if value is None or (isinstance(value, str) and value == ""):
        return None
    return value if isinstance(value, str) and value in _REVIEWED_REASONS else fallback.value


SafePriceReason = Annotated[str, AfterValidator(lambda value: public_reason(value, FailureReason.PRICE_FAILED))]
SafeEnrichmentReason = Annotated[str, AfterValidator(lambda value: public_reason(value, FailureReason.ENRICHMENT_FAILED))]
SafeBrokerReason = Annotated[str, AfterValidator(lambda value: public_reason(value, FailureReason.BROKER_FAILED))]
SafeAdvisorReason = Annotated[str, AfterValidator(lambda value: public_reason(value, FailureReason.ADVISOR_FAILED))]


def public_provider_result(value: dict) -> dict:
    """Normalize only error metadata; leave provider financial data unchanged."""
    result = dict(value)
    if "error" in result:
        result["error"] = public_reason(result["error"], FailureReason.PROVIDER_FAILED)
    return result
