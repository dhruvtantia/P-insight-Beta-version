from app.main import app


def test_openapi_schema_generation_contract():
    schema = app.openapi()

    assert schema["openapi"].startswith("3.")
    assert "/api/v1/system/features" in schema["paths"]
    assert "/api/v1/upload/parse" in schema["paths"]
    assert "/api/v1/upload/v2/confirm" in schema["paths"]
    assert "FeatureRegistryResponse" in schema["components"]["schemas"]
    assert "ParseResponse" in schema["components"]["schemas"]
    assert "V2ConfirmResponse" in schema["components"]["schemas"]
    assert "V2StatusResponse" in schema["components"]["schemas"]
