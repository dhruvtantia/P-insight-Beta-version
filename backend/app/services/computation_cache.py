"""Explicit process-local identity and invalidation for private computations."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from threading import Lock
from typing import TYPE_CHECKING, Any

from app.core.config import settings

if TYPE_CHECKING:
    from app.models.portfolio import Portfolio
    from app.schemas.portfolio import HoldingBase


@dataclass(frozen=True)
class PortfolioComputationScope:
    owner_id: int | None
    portfolio_id: int
    revision: str

    @classmethod
    def from_portfolio(cls, owner_id: int | None, portfolio: Portfolio) -> PortfolioComputationScope:
        # B09 will replace this timestamp surrogate with a persisted revision.
        revision = json.dumps({
            "updated_at": portfolio.updated_at.isoformat() if portfolio.updated_at else None,
            "last_synced_at": (
                portfolio.last_synced_at.isoformat() if portfolio.last_synced_at else None
            ),
        }, sort_keys=True)
        return cls(owner_id, portfolio.id, revision)


_generation = 0
_generation_lock = Lock()


def computation_generation() -> int:
    with _generation_lock:
        return _generation


def invalidate_private_computations() -> None:
    """Fence in-flight results as well as previously stored process-local entries."""
    global _generation
    with _generation_lock:
        _generation += 1


def provider_computation_scope(provider: Any) -> PortfolioComputationScope | None:
    scope = getattr(provider, "computation_cache_scope", None)
    if not isinstance(scope, PortfolioComputationScope):
        return None
    if settings.AUTH_ENABLED and scope.owner_id is None:
        return None
    return scope


def private_computation_key(
    namespace: str,
    provider: Any,
    scope: PortfolioComputationScope | None,
    holdings: list[HoldingBase],
    generation: int | None,
    **inputs: Any,
) -> str | None:
    if scope is None:
        return None
    try:
        payload = {
            "contract": 1,
            "namespace": namespace,
            "provider": [type(provider).__module__, type(provider).__qualname__, provider.mode_name],
            "scope": asdict(scope),
            "generation": generation,
            "holdings": [holding.model_dump(mode="json") for holding in holdings],
            "inputs": inputs,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    except (TypeError, ValueError, AttributeError):
        return None
    return f"{provider.mode_name}_{namespace}_{hashlib.sha256(encoded).hexdigest()}"
