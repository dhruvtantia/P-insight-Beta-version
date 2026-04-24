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

    async def _noop_background_enrichment(*args, **kwargs):
        return None

    monkeypatch.setattr(upload_endpoint, "run_background_enrichment", _noop_background_enrichment)
    monkeypatch.setattr(upload_endpoint, "UPLOADS_PATH", tmp_path)

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
