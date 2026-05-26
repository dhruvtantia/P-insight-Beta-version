import json


def _csv_bytes() -> bytes:
    return (
        "ticker,name,quantity,average_cost,current_price,sector\n"
        "TCS,Tata Consultancy Services,10,1000,1100,Information Technology\n"
        "INFY,Infosys,5,1500,1450,Information Technology\n"
    ).encode("utf-8")


def _column_mapping() -> str:
    return json.dumps(
        {
            "ticker": "ticker",
            "name": "name",
            "quantity": "quantity",
            "average_cost": "average_cost",
            "current_price": "current_price",
            "sector": "sector",
            "industry": None,
            "purchase_date": None,
            "notes": None,
        }
    )


def test_upload_parse_contract(client):
    response = client.post(
        "/api/v1/upload/parse",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["column_names"], list)
    assert isinstance(payload["detected_mapping"], dict)
    assert isinstance(payload["ambiguous_fields"], list)
    assert isinstance(payload["high_confidence"], bool)
    assert isinstance(payload["preview_rows"], list)
    assert payload["row_count"] == 2
    assert {"ticker", "quantity", "average_cost"}.issubset(set(payload["required_fields"]))
    assert isinstance(payload["optional_fields"], list)


def test_upload_v2_confirm_contract(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.upload as upload_endpoint
    import app.data_providers.file_provider as file_provider

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", _noop_background_enrichment)
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)
    file_provider._uploaded_holdings = []

    response = client.post(
        "/api/v1/upload/v2/confirm",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
        data={"column_mapping": _column_mapping()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["portfolio_id"], int)
    assert payload["filename"] == "portfolio.csv"
    assert payload["total_rows"] == 2
    assert payload["rows_valid"] == 2
    assert payload["rows_invalid"] == 0
    assert payload["portfolio_usable"] is True
    assert payload["enrichment_started"] is True
    assert payload["enrichment_complete"] is False
    assert payload["next_action"] in {"dashboard", "review_warnings", "fix_rejected"}
    assert isinstance(payload["rejected_rows"], list)
    assert isinstance(payload["warning_rows"], list)
    assert file_provider._uploaded_holdings == []

    status_query = client.get(f"/api/v1/upload/status?portfolio_id={payload['portfolio_id']}")
    assert status_query.status_code == 200
    query_payload = status_query.json()
    assert query_payload["portfolio_id"] == payload["portfolio_id"]
    assert query_payload["total_holdings"] == 2
    assert query_payload["enriched"] == 0
    assert query_payload["partial"] == 0
    assert query_payload["pending"] == 2
    assert query_payload["failed"] == 0
    assert query_payload["enrichment_complete"] is False
    assert query_payload["overall"] == "in_progress"
    assert isinstance(query_payload["holdings"], list)
    assert all(holding["enrichment_status"] == "pending" for holding in query_payload["holdings"])
    assert all(holding["fundamentals_status"] == "pending" for holding in query_payload["holdings"])
    assert all(holding["price_status"] == "uploaded_current_price" for holding in query_payload["holdings"])
    assert all(holding["price_source"] == "uploaded_csv" for holding in query_payload["holdings"])
    assert all(holding["price_timestamp"] is None for holding in query_payload["holdings"])
    assert all(holding["price_failure_reason"] is None for holding in query_payload["holdings"])

    status_path = client.get(f"/api/v1/upload/v2/status/{payload['portfolio_id']}")
    assert status_path.status_code == 200
    assert status_path.json() == query_payload

    full_response = client.get("/api/v1/portfolio/full?mode=uploaded")
    assert full_response.status_code == 200
    full_payload = full_response.json()
    assert full_payload["summary"]["num_holdings"] == 2
    assert [holding["ticker"] for holding in full_payload["holdings"]] == ["TCS", "INFY"]


def test_upload_status_contract_returns_404_for_missing_portfolio(client):
    response = client.get("/api/v1/upload/status?portfolio_id=999999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Portfolio 999999 not found"


def test_upload_status_contract_reports_mixed_terminal_enrichment(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.upload as upload_endpoint
    import app.data_providers.file_provider as file_provider
    from app.db.database import SessionLocal
    from app.models.portfolio import Holding

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", _noop_background_enrichment)
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)
    file_provider._uploaded_holdings = []

    created = client.post(
        "/api/v1/upload/v2/confirm",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
        data={"column_mapping": _column_mapping()},
    )
    assert created.status_code == 200
    portfolio_id = created.json()["portfolio_id"]

    db = SessionLocal()
    try:
        holdings = (
            db.query(Holding)
            .filter(Holding.portfolio_id == portfolio_id)
            .order_by(Holding.ticker)
            .all()
        )
        assert len(holdings) == 2
        holdings[0].enrichment_status = "enriched"
        holdings[0].sector_status = "from_file"
        holdings[0].name_status = "from_file"
        holdings[0].fundamentals_status = "fetched"
        holdings[0].peers_status = "found"
        holdings[0].current_price = 3210.5
        holdings[0].price_status = "live"
        holdings[0].price_source = "yfinance"
        holdings[0].price_failure_reason = None
        holdings[1].enrichment_status = "partial"
        holdings[1].sector_status = "static_map"
        holdings[1].name_status = "from_file"
        holdings[1].fundamentals_status = "unavailable"
        holdings[1].peers_status = "found"
        holdings[1].failure_reason = "fundamentals_unavailable"
        holdings[1].current_price = None
        holdings[1].price_status = "provider_failed"
        holdings[1].price_source = "yfinance"
        holdings[1].price_failure_reason = "yfinance unavailable"
        db.commit()
    finally:
        db.close()

    response = client.get(f"/api/v1/upload/v2/status/{portfolio_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["enriched"] == 1
    assert payload["partial"] == 1
    assert payload["pending"] == 0
    assert payload["failed"] == 0
    assert payload["enrichment_complete"] is True
    assert payload["overall"] == "done"
    assert any(
        holding["failure_reason"] == "fundamentals_unavailable"
        for holding in payload["holdings"]
    )
    by_ticker = {holding["ticker"]: holding for holding in payload["holdings"]}
    assert by_ticker["INFY"]["price_status"] == "live"
    assert by_ticker["INFY"]["price_source"] == "yfinance"
    assert by_ticker["INFY"]["price_failure_reason"] is None
    assert by_ticker["TCS"]["price_status"] == "provider_failed"
    assert by_ticker["TCS"]["price_source"] == "yfinance"
    assert by_ticker["TCS"]["price_failure_reason"] == "yfinance unavailable"


def test_upload_confirm_contract_uses_db_not_memory_cache(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.upload as upload_endpoint
    import app.data_providers.file_provider as file_provider
    import app.data_providers.live_provider as live_provider
    import app.services.history_service as history_service
    import app.services.upload_confirm_service as confirm_service

    def _noop_enrichment(holdings):
        return holdings, [], 0, None

    async def _noop_prewarm(*_args, **_kwargs):
        return None

    def _noop_history(*_args, **_kwargs):
        return None

    monkeypatch.setattr(confirm_service, "enrich_holdings", _noop_enrichment)
    monkeypatch.setattr(confirm_service, "pre_warm_uploaded_quant_cache", _noop_prewarm)
    monkeypatch.setattr(history_service, "build_and_store_portfolio_history", _noop_history)
    monkeypatch.setattr(live_provider, "YFINANCE_AVAILABLE", False)
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)
    file_provider._uploaded_holdings = []

    response = client.post(
        "/api/v1/upload/confirm",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
        data={"column_mapping": _column_mapping()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["holdings_parsed"] == 2
    assert payload["rows_accepted"] == 2
    assert file_provider._uploaded_holdings == []

    full_response = client.get("/api/v1/portfolio/full?mode=uploaded")
    assert full_response.status_code == 200
    assert full_response.json()["summary"]["num_holdings"] == 2


def test_portfolio_refresh_contract_uses_db_not_memory_cache(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.upload as upload_endpoint
    import app.data_providers.file_provider as file_provider

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", _noop_background_enrichment)
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)
    file_provider._uploaded_holdings = []

    created = client.post(
        "/api/v1/upload/v2/confirm",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
        data={"column_mapping": _column_mapping()},
    )
    assert created.status_code == 200
    portfolio_id = created.json()["portfolio_id"]

    refreshed = client.post(
        f"/api/v1/portfolios/{portfolio_id}/refresh",
        files={"file": ("portfolio-refresh.csv", _csv_bytes(), "text/csv")},
        data={"column_mapping": _column_mapping()},
    )

    assert refreshed.status_code == 200
    assert refreshed.json()["holdings_parsed"] == 2
    assert file_provider._uploaded_holdings == []

    full_response = client.get("/api/v1/portfolio/full?mode=uploaded")
    assert full_response.status_code == 200
    assert full_response.json()["summary"]["num_holdings"] == 2
