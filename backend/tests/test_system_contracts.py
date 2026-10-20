def test_health_contract(client):
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert set(payload) == {"status"}


def test_readiness_contract(client):
    response = client.get("/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["database"]["ok"] is True
    assert payload["database"]["driver"] in {"sqlite", "postgresql"}
