import json

import pandas as pd
import pytest
from fastapi import BackgroundTasks

from app.db.database import SessionLocal
from app.ingestion.normalizer import read_file_as_dataframe
from app.models.portfolio import Holding
from app.services.isolated_upload_module import (
    IsolatedUploadModule,
    UploadConfirmRequest,
    UploadModuleContractError,
    UploadParseRequest,
)
from app.services.upload_v2_service import classify_rows_v2


def _rows() -> list[dict]:
    return [
        {
            "ticker": "TCS",
            "name": "Tata Consultancy Services",
            "quantity": "10",
            "average_cost": "1000",
            "current_price": "1100",
            "sector": "Information Technology",
        },
        {
            "ticker": "INFY",
            "name": "Infosys",
            "quantity": "5",
            "average_cost": "1500",
            "current_price": "1450",
            "sector": "Information Technology",
        },
    ]


def _mapping() -> dict[str, str | None]:
    return {
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


def _write_csv(tmp_path, rows: list[dict] | None = None):
    path = tmp_path / "portfolio.csv"
    pd.DataFrame(rows or _rows()).to_csv(path, index=False)
    return path


def _write_excel(tmp_path, rows: list[dict] | None = None):
    path = tmp_path / "portfolio.xlsx"
    pd.DataFrame(rows or _rows()).to_excel(path, index=False)
    return path


def test_isolated_upload_parse_contract_matches_v2_parse_shape(tmp_path):
    path = _write_csv(tmp_path)
    module = IsolatedUploadModule(SessionLocal)

    result = module.parse_file(UploadParseRequest(file_path=path))

    assert result.column_names == list(pd.DataFrame(_rows()).columns)
    assert result.detected_mapping["ticker"] == "ticker"
    assert result.detected_mapping["quantity"] == "quantity"
    assert result.detected_mapping["average_cost"] == "average_cost"
    assert result.row_count == 2
    assert {"ticker", "quantity", "average_cost"}.issubset(set(result.required_fields))
    assert isinstance(result.preview_rows, list)


def test_isolated_upload_validates_excel_files(tmp_path):
    path = _write_excel(tmp_path)
    module = IsolatedUploadModule(SessionLocal)

    result = module.validate_file(
        UploadConfirmRequest(
            file_path=path,
            filename="portfolio.xlsx",
            column_mapping=_mapping(),
            schedule_background_work=False,
        )
    )

    assert len(result.accepted) == 2
    assert len(result.rejected) == 0
    assert len(result.warning_rows) == 0


def test_isolated_upload_golden_validation_matches_v2_classifier(tmp_path):
    rows = _rows() + [
        {
            "ticker": "INE009A01021",
            "name": "ISIN Row",
            "quantity": "2",
            "average_cost": "1200",
            "current_price": "",
            "sector": "",
        },
        {
            "ticker": "",
            "name": "Bad Row",
            "quantity": "",
            "average_cost": "100",
            "current_price": "",
            "sector": "",
        },
    ]
    path = _write_csv(tmp_path, rows)
    module = IsolatedUploadModule(SessionLocal)
    request = UploadConfirmRequest(
        file_path=path,
        filename="portfolio.csv",
        column_mapping=_mapping(),
        schedule_background_work=False,
    )

    candidate = module.validate_file(request)
    baseline = classify_rows_v2(read_file_as_dataframe(path), _mapping())
    accepted, rejected, warning_rows = baseline

    assert len(candidate.accepted) == len(accepted)
    assert len(candidate.rejected) == len(rejected)
    assert len(candidate.warning_rows) == len(warning_rows)
    assert [(h.ticker, h.quantity, h.average_cost, h.sector) for h in candidate.accepted] == [
        (h.ticker, h.quantity, h.average_cost, h.sector) for h in accepted
    ]
    assert candidate.rows_valid_with_warning == 1
    assert candidate.rows_invalid == 1


def test_isolated_upload_missing_required_mapping_fails_before_persist(tmp_path):
    path = _write_csv(tmp_path)
    mapping = _mapping()
    mapping["average_cost"] = None
    module = IsolatedUploadModule(SessionLocal)

    with pytest.raises(UploadModuleContractError, match="average_cost"):
        module.validate_file(
            UploadConfirmRequest(
                file_path=path,
                filename="portfolio.csv",
                column_mapping=mapping,
            )
        )


def test_isolated_upload_confirm_persists_without_public_route_or_background(tmp_path):
    path = _write_csv(tmp_path)
    module = IsolatedUploadModule(SessionLocal)

    result = module.confirm(
        UploadConfirmRequest(
            file_path=path,
            filename="portfolio.csv",
            column_mapping=_mapping(),
            schedule_background_work=False,
        )
    )

    assert result.portfolio_id > 0
    assert result.v2_response.total_rows == 2
    assert result.v2_response.rows_valid == 2
    assert result.v2_response.rows_invalid == 0
    assert result.v2_response.portfolio_usable is True

    status = module.get_status(result.portfolio_id)
    assert status.portfolio_id == result.portfolio_id
    assert status.total_holdings == 2
    assert status.pending == 2
    assert status.overall == "in_progress"


def test_isolated_upload_schedules_post_upload_workflow_when_requested(tmp_path):
    path = _write_csv(tmp_path)
    captured = {}

    class FakeWorkflow:
        def __init__(self, **kwargs):
            captured["kwargs"] = kwargs

        def run(self, event):
            captured["event"] = event

    module = IsolatedUploadModule(
        SessionLocal,
        background_tasks=BackgroundTasks(),
        workflow_factory=FakeWorkflow,
    )

    result = module.confirm(
        UploadConfirmRequest(
            file_path=path,
            filename="portfolio.csv",
            column_mapping=_mapping(),
            schedule_background_work=True,
        )
    )

    assert captured["event"].portfolio_id == result.portfolio_id
    assert captured["event"].filename == "portfolio.csv"
    assert len(captured["event"].holdings) == 2


def test_isolated_upload_status_represents_provider_failure_without_pending(tmp_path):
    path = _write_csv(tmp_path)
    module = IsolatedUploadModule(SessionLocal)
    result = module.confirm(
        UploadConfirmRequest(
            file_path=path,
            filename="portfolio.csv",
            column_mapping=_mapping(),
            schedule_background_work=False,
        )
    )

    db = SessionLocal()
    try:
        holdings = db.query(Holding).filter(Holding.portfolio_id == result.portfolio_id).all()
        for holding in holdings:
            holding.enrichment_status = "failed"
            holding.sector_status = "unknown"
            holding.name_status = "ticker_fallback"
            holding.fundamentals_status = "unavailable"
            holding.peers_status = "none"
            holding.failure_reason = "provider_unavailable"
        db.commit()
    finally:
        db.close()

    status = module.get_status(result.portfolio_id)
    assert status.pending == 0
    assert status.failed == 2
    assert status.enrichment_complete is True
    assert status.overall == "failed"
    assert {h.failure_reason for h in status.holdings} == {"provider_unavailable"}
