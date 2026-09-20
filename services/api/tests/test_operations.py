def test_health_and_metrics_are_available_without_authentication(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "bhramari_http_requests_total" in metrics.text
