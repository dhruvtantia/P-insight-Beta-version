import pytest

from app.core.config import settings


def test_news_contract_distinguishes_missing_key_from_empty(client, monkeypatch):
    monkeypatch.setattr(settings, "NEWS_API_KEY", "")

    response = client.get("/api/v1/news/?mode=uploaded&tickers=TCS.NS")

    assert response.status_code == 200
    payload = response.json()
    assert payload["articles"] == []
    assert payload["news_unavailable"] is True
    assert payload["news_status"] == "unavailable"
    assert payload["news_reason"] == "NEWS_API_KEY is not configured"


def test_news_contract_marks_empty_results_when_provider_returns_no_articles(client, monkeypatch):
    monkeypatch.setattr(settings, "NEWS_API_KEY", "test-key")
    from app.data_providers import live_provider

    monkeypatch.setattr(live_provider, "_fetch_newsapi_articles", lambda *_args, **_kwargs: [])

    response = client.get("/api/v1/news/?mode=uploaded&tickers=TCS.NS")

    assert response.status_code == 200
    payload = response.json()
    assert payload["articles"] == []
    assert payload["news_unavailable"] is False
    assert payload["news_status"] == "empty"
    assert payload["news_reason"] == "No articles matched the requested tickers or filters"


def test_news_contract_maps_successful_articles_to_canonical_tickers(client, monkeypatch):
    monkeypatch.setattr(settings, "NEWS_API_KEY", "test-key")

    import httpx

    captured_params = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "status": "ok",
                "articles": [
                    {
                        "title": "TCS reports quarterly earnings growth",
                        "description": "TCS revenue rose in the latest results.",
                        "source": {"name": "Example Wire"},
                        "url": "https://example.com/tcs-earnings",
                        "publishedAt": "2026-05-25T10:00:00Z",
                    }
                ],
            }

    def fake_get(_url, params, timeout):
        captured_params.update(params)
        assert timeout == 10
        return FakeResponse()

    monkeypatch.setattr(httpx, "get", fake_get)

    response = client.get("/api/v1/news/?mode=uploaded&tickers=TCS.NS&event_type=earnings")

    assert response.status_code == 200
    payload = response.json()
    assert payload["news_status"] == "ok"
    assert payload["news_unavailable"] is False
    assert captured_params["q"] == '("TCS") earnings OR results OR quarterly'
    assert payload["articles"][0]["tickers"] == ["TCS.NS"]
    assert payload["articles"][0]["event_type"] == "earnings"
    assert payload["articles"][0]["sentiment"] == "neutral"


def test_news_contract_marks_provider_failure_unavailable(client, monkeypatch):
    monkeypatch.setattr(settings, "NEWS_API_KEY", "test-key")
    from app.data_providers import live_provider

    def fail_fetch(*_args, **_kwargs):
        raise live_provider.NewsAPIProviderError("quota exceeded")

    monkeypatch.setattr(live_provider, "_fetch_newsapi_articles", fail_fetch)

    response = client.get("/api/v1/news/?mode=uploaded&tickers=TCS.NS")

    assert response.status_code == 200
    payload = response.json()
    assert payload["articles"] == []
    assert payload["news_status"] == "unavailable"
    assert payload["news_unavailable"] is True
    assert "quota exceeded" in payload["news_reason"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/news/?mode=uploaded&tickers=TCS.NS&event_type=not_a_type",
        "/api/v1/news/events?mode=uploaded&tickers=TCS.NS&event_type=not_a_type",
    ],
)
def test_news_contract_rejects_unknown_event_type(client, path):
    response = client.get(path)

    assert response.status_code == 422


def test_events_contract_exposes_empty_status(client, monkeypatch):
    monkeypatch.setattr(settings, "NEWS_API_KEY", "test-key")

    response = client.get("/api/v1/news/events?mode=uploaded&tickers=TCS.NS")

    assert response.status_code == 200
    payload = response.json()
    assert payload["events"] == []
    assert payload["events_status"] == "empty"
    assert payload["events_reason"] == "No corporate events matched the requested tickers or filters"
