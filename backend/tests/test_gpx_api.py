from app.core.config import settings


def _gpx(points: list[tuple[float, float, str]]) -> bytes:
    body = "".join(f'<rtept lat="{lat}" lon="{lon}"><name>{name}</name></rtept>' for lat, lon, name in points)
    return f'<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><rte>{body}</rte></gpx>'.encode()


def _import(client, content: bytes):
    return client.post("/api/gpx/import", files={"file": ("trajet.gpx", content, "application/gpx+xml")})


def _saved_route(client, name="Col de l'Iseran — été"):
    payload = {
        "name": name,
        "waypoints": [{"lat": 45.41, "lon": 7.03, "label": "Val d'Isère"}, {"lat": 45.26, "lon": 7.02}],
        "distance_m": 30000,
        "duration_s": 2400,
        "geometry_geojson": {"type": "LineString", "coordinates": [[7.03, 45.41], [7.025, 45.33], [7.02, 45.26]]},
    }
    return client.post("/api/routes", json=payload).json()


def test_export_gpx_returns_downloadable_file(client):
    route = _saved_route(client)
    resp = client.get(f"/api/routes/{route['id']}/export.gpx")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/gpx+xml")

    disposition = resp.headers["content-disposition"]
    assert disposition.isascii()
    assert 'filename="' in disposition
    assert "filename*=UTF-8''" in disposition
    assert "%C3%A9t%C3%A9" in disposition  # "été" encodé dans filename*

    assert "<rtept" in resp.text
    assert "Val d&apos;Isère" in resp.text or "Val d'Isère" in resp.text
    assert resp.text.count("<trkpt") == 3


def test_export_gpx_missing_route_returns_404(client):
    assert client.get("/api/routes/999999/export.gpx").status_code == 404


def test_import_gpx_rejects_oversized_file(client, monkeypatch):
    monkeypatch.setattr(settings, "max_gpx_upload_bytes", 100)
    resp = _import(client, _gpx([(45.0, 5.0, "A" * 200), (46.0, 6.0, "B")]))
    assert resp.status_code == 413


def test_import_gpx_rejects_invalid_xml(client):
    resp = _import(client, b"ceci n'est pas du XML <<<")
    assert resp.status_code == 400


def test_import_gpx_requires_two_usable_points(client):
    resp = _import(client, _gpx([(45.0, 5.0, "Seul")]))
    assert resp.status_code == 400
    assert "2 points" in resp.json()["detail"]


def test_import_gpx_keeps_destination_and_leaves_headroom_when_truncating(client):
    count = settings.max_waypoints * 2
    points = [(45.0 + i * 0.001, 5.0 + i * 0.001, "Départ" if i == 0 else "Arrivée" if i == count - 1 else f"P{i}")
              for i in range(count)]
    resp = _import(client, _gpx(points))
    assert resp.status_code == 200
    data = resp.json()
    assert data["truncated"] is True
    # Comme pour le circuit en boucle : un emplacement reste libre sous la limite.
    assert len(data["waypoints"]) <= settings.max_waypoints - 1
    assert data["waypoints"][0]["label"] == "Départ"
    assert data["waypoints"][-1]["label"] == "Arrivée"
