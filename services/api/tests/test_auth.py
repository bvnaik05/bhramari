def test_public_auth_config_exposes_demo_without_secrets(client):
    response = client.get("/api/v1/auth/config")

    assert response.status_code == 200
    assert response.json() == {"mode": "demo"}
