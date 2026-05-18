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
        stage_recorder = kwargs.get("stage_recorder")
        if stage_recorder is not None:
            stage_recorder.running("sector_enrichment", "test sector enrichment")
            stage_recorder.succeeded("sector_enrichment", "test sector enrichment done")
            stage_recorder.running("history_build", "test history build")
            stage_recorder.succeeded("history_build", "test history build done")
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
    assert query_payload["overall"] in {"in_progress", "done", "failed"}
    assert isinstance(query_payload["holdings"], list)

    status_path = client.get(f"/api/v1/upload/v2/status/{payload['portfolio_id']}")
    assert status_path.status_code == 200
    assert status_path.json() == query_payload

    full_response = client.get("/api/v1/portfolio/full?mode=uploaded")
    assert full_response.status_code == 200
    full_payload = full_response.json()
    assert full_payload["summary"]["num_holdings"] == 2
    assert [holding["ticker"] for holding in full_payload["holdings"]] == ["TCS", "INFY"]


def test_upload_v2_confirm_records_durable_background_job(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.upload as upload_endpoint
    from app.db.database import SessionLocal
    from app.services.job_status_service import JobStatusService

    async def _noop_background_enrichment(*args, **kwargs):
        stage_recorder = kwargs.get("stage_recorder")
        if stage_recorder is not None:
            stage_recorder.running("sector_enrichment", "test sector enrichment")
            stage_recorder.succeeded("sector_enrichment", "test sector enrichment done")
            stage_recorder.running("history_build", "test history build")
            stage_recorder.succeeded("history_build", "test history build done")
        return None

    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", _noop_background_enrichment)
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)

    response = client.post(
        "/api/v1/upload/v2/confirm",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
        data={"column_mapping": _column_mapping()},
    )

    assert response.status_code == 200
    portfolio_id = response.json()["portfolio_id"]

    db = SessionLocal()
    try:
        job = JobStatusService(db).get_latest_upload_job(portfolio_id)
        assert job is not None
        assert job.job_type == "upload_enrichment"
        assert job.owner_type == "portfolio"
        assert job.owner_id == portfolio_id
        assert job.status == "succeeded"
        assert job.stage == "complete"
        assert job.started_at is not None
        assert job.completed_at is not None
        stages = JobStatusService(db).get_latest_upload_job_stages(portfolio_id)
        by_stage = {stage.stage: stage for stage in stages}
        assert by_stage["workflow"].status == "succeeded"
        assert by_stage["sector_enrichment"].status == "succeeded"
        assert by_stage["history_build"].status == "succeeded"
        assert by_stage["sector_enrichment"].started_at is not None
        assert by_stage["sector_enrichment"].completed_at is not None
    finally:
        db.close()

    stage_response = client.get(f"/api/v1/upload/v2/status/{portfolio_id}/stages")
    assert stage_response.status_code == 200
    stage_payload = stage_response.json()
    assert stage_payload["portfolio_id"] == portfolio_id
    assert stage_payload["job_status"] == "succeeded"
    stage_statuses = {stage["stage"]: stage["status"] for stage in stage_payload["stages"]}
    assert stage_statuses["workflow"] == "succeeded"
    assert stage_statuses["sector_enrichment"] == "succeeded"
    assert stage_statuses["history_build"] == "succeeded"


def test_upload_status_contract_returns_404_for_missing_portfolio(client):
    response = client.get("/api/v1/upload/status?portfolio_id=999999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Portfolio 999999 not found"


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
    import app.api.v1.endpoints.portfolios_mgmt as portfolios_mgmt_endpoint
    import app.api.v1.endpoints.upload as upload_endpoint
    import app.data_providers.file_provider as file_provider

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    monkeypatch.setattr(
        portfolios_mgmt_endpoint, "run_background_enrichment", _noop_background_enrichment
    )
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


def test_deprecated_portfolio_upload_delegates_to_canonical_pipeline(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.portfolio as portfolio_endpoint
    import app.data_providers.file_provider as file_provider

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    monkeypatch.setattr(
        portfolio_endpoint, "run_background_enrichment", _noop_background_enrichment
    )
    monkeypatch.setattr(portfolio_endpoint, "UPLOADS_PATH", tmp_path)
    file_provider._uploaded_holdings = []

    response = client.post(
        "/api/v1/portfolio/upload",
        files={"file": ("portfolio.csv", _csv_bytes(), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["filename"] == "portfolio.csv"
    assert payload["holdings_parsed"] == 2
    assert "deprecated" in payload["message"].lower()
    assert file_provider._uploaded_holdings == []

    full_response = client.get("/api/v1/portfolio/full?mode=uploaded")
    assert full_response.status_code == 200
    full_payload = full_response.json()
    assert full_payload["summary"]["num_holdings"] == 2
    assert [holding["ticker"] for holding in full_payload["holdings"]] == ["TCS", "INFY"]


def test_portfolio_refresh_schedules_post_upload_enrichment(client, monkeypatch, tmp_path):
    import app.api.v1.endpoints.portfolios_mgmt as portfolios_mgmt_endpoint
    import app.api.v1.endpoints.upload as upload_endpoint
    from app.db.database import SessionLocal
    from app.services.job_status_service import JobStatusService

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    calls: list[tuple[int, int]] = []

    async def _complete_refresh_enrichment(portfolio_id, holdings, db_factory):
        from app.models.portfolio import Holding

        calls.append((portfolio_id, len(holdings)))
        db = db_factory()
        try:
            db_holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio_id).all()
            for holding in db_holdings:
                holding.enrichment_status = "failed"
                holding.fundamentals_status = "unavailable"
                holding.failure_reason = "test_refresh_enrichment_completed"
            db.commit()
        finally:
            db.close()

    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", _noop_background_enrichment)
    monkeypatch.setattr(
        portfolios_mgmt_endpoint, "run_background_enrichment", _complete_refresh_enrichment
    )
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)

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
    assert calls == [(portfolio_id, 2)]

    status_response = client.get(f"/api/v1/upload/status?portfolio_id={portfolio_id}")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["pending"] == 0
    assert status_payload["failed"] == 2
    assert status_payload["enrichment_complete"] is True
    assert status_payload["overall"] == "failed"

    db = SessionLocal()
    try:
        job = JobStatusService(db).get_latest_upload_job(portfolio_id)
        assert job is not None
        assert job.status == "succeeded"
        assert job.stage == "complete"
        stages = JobStatusService(db).get_latest_upload_job_stages(portfolio_id)
        by_stage = {stage.stage: stage for stage in stages}
        assert by_stage["workflow"].status == "succeeded"
    finally:
        db.close()
