from app.services.cache_service import HistoryBuildStatusStore, TimedMemoryCache


def test_timed_memory_cache_returns_value_and_age():
    cache = TimedMemoryCache(lambda _key: 60.0)

    cache.set("uploaded_1y", {"ok": True})

    cached = cache.get_with_age("uploaded_1y")
    assert cached is not None

    value, age = cached
    assert value == {"ok": True}
    assert age >= 0
    assert cache.get("uploaded_1y") == {"ok": True}


def test_history_build_status_store_preserves_status_contract():
    store = HistoryBuildStatusStore()

    assert store.get_status(123)["status"] == "unknown"

    store.set_status(123, "building", rows_written=0, note="started")
    building = store.get_status(123)
    assert building["status"] == "building"
    assert building["rows_written"] == 0
    assert building["note"] == "started"
    assert building["started_at"] is not None
    assert building["finished_at"] is None

    store.set_status(123, "done", rows_written=5, benchmark_rows=7)
    done = store.get_status(123)
    assert done["status"] == "done"
    assert done["rows_written"] == 5
    assert done["benchmark_rows"] == 7
    assert done["finished_at"] is not None
