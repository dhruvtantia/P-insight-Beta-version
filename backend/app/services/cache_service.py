"""
Lightweight process-local cache and status wrappers.

These wrappers keep today's in-memory behavior intact while giving modules a
named boundary that can later be replaced by Redis, database rows, or another
durable store without touching endpoint code.
"""

from __future__ import annotations

from datetime import datetime, timezone
import time
from typing import Any, Callable, Optional


class TimedMemoryCache:
    """Small TTL cache for process-local computed values."""

    def __init__(self, ttl_for_key: Callable[[str], float]) -> None:
        self._ttl_for_key = ttl_for_key
        self._entries: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self.get_with_age(key)
        if entry is None:
            return None
        value, _age = entry
        return value

    def get_with_age(self, key: str) -> Optional[tuple[Any, float]]:
        entry = self._entries.get(key)
        if entry is None:
            return None

        value, stored_at = entry
        age = time.time() - stored_at
        if age < self._ttl_for_key(key):
            return value, age

        self._entries.pop(key, None)
        return None

    def set(self, key: str, value: Any) -> None:
        self._entries[key] = (value, time.time())

    def clear(self) -> None:
        self._entries.clear()


class HistoryBuildStatusStore:
    """Process-local tracker for live portfolio history build progress."""

    _UNKNOWN_STATUS = {
        "status": "unknown",
        "rows_written": 0,
        "benchmark_rows": 0,
        "error": None,
        "note": None,
        "started_at": None,
        "finished_at": None,
    }

    def __init__(self) -> None:
        self._statuses: dict[int, dict[str, Any]] = {}

    def set_status(
        self,
        portfolio_id: int,
        status: str,
        *,
        rows_written: int = 0,
        benchmark_rows: int = 0,
        error: Optional[str] = None,
        note: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        entry = self._statuses.setdefault(portfolio_id, {})
        entry["status"] = status
        entry["error"] = error
        entry["note"] = note
        entry["rows_written"] = rows_written
        entry["benchmark_rows"] = benchmark_rows

        if status in ("pending", "building"):
            entry["started_at"] = now
            entry["finished_at"] = None
        else:
            entry.setdefault("started_at", now)
            entry["finished_at"] = now

    def get_status(self, portfolio_id: int) -> dict[str, Any]:
        return dict(self._statuses.get(portfolio_id, self._UNKNOWN_STATUS))

    def clear(self) -> None:
        self._statuses.clear()
