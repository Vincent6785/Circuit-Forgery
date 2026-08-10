from app.routers import health as health_module


def test_health_reports_graphhopper_up(client, monkeypatch):
    async def fake_health():
        return True

    monkeypatch.setattr(health_module.graphhopper_client, "health", fake_health)

    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["graphhopper"] is True
    assert body["database"] is True


def test_health_reports_graphhopper_down(client, monkeypatch):
    async def fake_health():
        return False

    monkeypatch.setattr(health_module.graphhopper_client, "health", fake_health)

    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["graphhopper"] is False
