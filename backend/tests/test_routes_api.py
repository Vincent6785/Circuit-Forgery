from app.routers import routes as routes_module

GPX_LONDON_PARIS = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="51.5074" lon="-0.1278"><name>Londres</name></rtept>
    <rtept lat="48.8566" lon="2.3522"><name>Paris</name></rtept>
  </rte>
</gpx>"""

GPX_PARIS_ONLY = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="48.8566" lon="2.3522"><name>A</name></rtept>
    <rtept lat="48.8738" lon="2.2950"><name>B</name></rtept>
  </rte>
</gpx>"""


def _route_payload(waypoints):
    return {
        "name": "trajet test",
        "waypoints": waypoints,
        "distance_m": 10,
        "duration_s": 1,
        "geometry_geojson": {"type": "LineString", "coordinates": []},
    }


def test_create_route_rejects_single_waypoint(client):
    resp = client.post("/api/routes", json=_route_payload([{"lat": 48.85, "lon": 2.35}]))
    assert resp.status_code == 422


def test_create_route_accepts_two_waypoints(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    resp = client.post("/api/routes", json=payload)
    assert resp.status_code == 201


def test_update_route_rejects_single_waypoint(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()
    resp = client.put(f"/api/routes/{created['id']}", json={"waypoints": [{"lat": 48.85, "lon": 2.35}]})
    assert resp.status_code == 422


def test_import_gpx_rejects_points_outside_france(client):
    resp = client.post(
        "/api/gpx/import", files={"file": ("test.gpx", GPX_LONDON_PARIS, "application/gpx+xml")}
    )
    assert resp.status_code == 400


def test_import_gpx_accepts_valid_points(client):
    resp = client.post("/api/gpx/import", files={"file": ("test.gpx", GPX_PARIS_ONLY, "application/gpx+xml")})
    assert resp.status_code == 200
    assert len(resp.json()["waypoints"]) == 2


def _fake_path(distance=1000.0, coords=None):
    return {
        "distance": distance,
        "time": 60000,
        "points": {
            "type": "LineString",
            "coordinates": coords or [[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]],
        },
        "details": {},
    }


def test_round_trip_returns_sampled_waypoints(client, monkeypatch):
    async def fake_round_trip(start, distance_m, seed=None, profile=None):
        return _fake_path(distance=20000.0)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["waypoints"]) >= 2
    assert data["distance_m"] == 20000.0


def test_round_trip_marks_simplified_when_dense_track_is_subsampled(client, monkeypatch):
    dense_coords = [[2.35 + i * 0.0001, 48.85 + i * 0.0001] for i in range(500)]

    async def fake_round_trip(start, distance_m, seed=None, profile=None):
        return _fake_path(distance=20000.0, coords=dense_coords)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000}
    )
    data = resp.json()
    assert data["simplified"] is True
    # Un emplacement reste volontairement libre sous settings.max_waypoints
    # (20), pour qu'une mutation ultérieure (ajouter un point, par exemple)
    # ne heurte pas aussitôt cette même limite sur /compute.
    assert len(data["waypoints"]) <= 19


def test_round_trip_not_simplified_for_short_track(client, monkeypatch):
    async def fake_round_trip(start, distance_m, seed=None, profile=None):
        return _fake_path(distance=1000.0)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 1000}
    )
    assert resp.json()["simplified"] is False


def test_round_trip_reserves_headroom_under_max_waypoints(client, monkeypatch):
    # Vérifie le contrat de bout en bout : un tracé dense généré laisse bien
    # la marge annoncée ci-dessus, et ajouter un point après coup passe le
    # recalcul automatique sur /compute sans re-déclencher la même erreur.
    dense_coords = [[2.35 + i * 0.0001, 48.85 + i * 0.0001] for i in range(500)]

    async def fake_round_trip(start, distance_m, seed=None, profile=None):
        return _fake_path(distance=20000.0, coords=dense_coords)

    async def fake_route(points, profile=None, avoid_zones=None):
        return _fake_path(distance=20000.0, coords=[[2.35, 48.85], [2.36, 48.86]])

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)
    monkeypatch.setattr(routes_module.graphhopper_client, "route", fake_route)

    resp = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000}
    )
    data = resp.json()
    waypoints = data["waypoints"]
    assert len(waypoints) < 20  # settings.max_waypoints, avec la marge réservée à la génération

    follow_up = client.post(
        "/api/routes/compute",
        json={"waypoints": [{"lat": w["lat"], "lon": w["lon"]} for w in waypoints] + [{"lat": 48.9, "lon": 2.4}]},
    )
    assert follow_up.status_code == 200


def test_round_trip_rejects_distance_over_limit(client):
    resp = client.post(
        "/api/routes/round-trip",
        json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 10_000_000},
    )
    assert resp.status_code == 400


def test_round_trip_rejects_start_outside_france(client):
    resp = client.post(
        "/api/routes/round-trip",
        json={"start": {"lat": 51.5074, "lon": -0.1278}, "distance_m": 20000},
    )
    assert resp.status_code == 400


def test_alternatives_returns_multiple_options(client, monkeypatch):
    async def fake_alternatives(points, profile=None):
        return [_fake_path(distance=1000.0), _fake_path(distance=1200.0)]

    monkeypatch.setattr(routes_module.graphhopper_client, "route_alternatives", fake_alternatives)

    resp = client.post(
        "/api/routes/alternatives",
        json={"waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]},
    )
    assert resp.status_code == 200
    assert len(resp.json()["alternatives"]) == 2


def test_alternatives_rejects_wrong_number_of_waypoints(client):
    resp = client.post("/api/routes/alternatives", json={"waypoints": [{"lat": 48.85, "lon": 2.35}]})
    assert resp.status_code == 422


def test_create_route_persists_avoid_zones(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    payload["avoid_zones"] = [{"lat": 48.855, "lon": 2.355, "radius_m": 300}]
    created = client.post("/api/routes", json=payload).json()
    assert created["avoid_zones"] == [{"lat": 48.855, "lon": 2.355, "radius_m": 300}]

    fetched = client.get(f"/api/routes/{created['id']}").json()
    assert fetched["avoid_zones"] == [{"lat": 48.855, "lon": 2.355, "radius_m": 300}]


def test_create_route_without_avoid_zones_defaults_to_empty_list(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()
    assert created["avoid_zones"] == []


def test_update_route_replaces_avoid_zones(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()

    resp = client.put(
        f"/api/routes/{created['id']}",
        json={"avoid_zones": [{"lat": 48.86, "lon": 2.36, "radius_m": 1000}]},
    )
    assert resp.status_code == 200
    assert resp.json()["avoid_zones"] == [{"lat": 48.86, "lon": 2.36, "radius_m": 1000}]
