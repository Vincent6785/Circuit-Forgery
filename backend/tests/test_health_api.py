import pytest

from app.routers import health as health_module


def _graphhopper_health(monkeypatch, ok):
    async def fake_health():
        return ok

    monkeypatch.setattr(health_module.graphhopper_client, "health", fake_health)


def test_health_reports_all_dependencies_up(client, monkeypatch):
    _graphhopper_health(monkeypatch, True)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "graphhopper": True, "database": True}


def test_health_reports_graphhopper_down_but_stays_200(client, monkeypatch):
    _graphhopper_health(monkeypatch, False)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "degraded", "graphhopper": False, "database": True}


def test_health_reports_database_down(client, monkeypatch):
    _graphhopper_health(monkeypatch, True)
    monkeypatch.setattr(health_module, "_database_ok", lambda: False)
    assert client.get("/api/health").json() == {"status": "degraded", "graphhopper": True, "database": False}


@pytest.mark.parametrize(("graphhopper_ok", "expected_status"), [(True, 200), (False, 503)])
def test_ready_reflects_dependencies_in_status_code(client, monkeypatch, graphhopper_ok, expected_status):
    _graphhopper_health(monkeypatch, graphhopper_ok)
    assert client.get("/api/health/ready").status_code == expected_status


def test_live_does_not_query_dependencies(client, monkeypatch):
    async def must_not_be_called():
        raise AssertionError("la sonde de vivacité ne doit pas interroger GraphHopper")

    monkeypatch.setattr(health_module.graphhopper_client, "health", must_not_be_called)
    resp = client.get("/api/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_database_check_closes_session_even_on_error(monkeypatch):
    closed = []

    class FailingSession:
        def execute(self, statement):
            raise RuntimeError("base verrouillée")

        def close(self):
            closed.append(True)

    monkeypatch.setattr(health_module, "SessionLocal", FailingSession)
    assert health_module._database_ok() is False
    assert closed == [True]
