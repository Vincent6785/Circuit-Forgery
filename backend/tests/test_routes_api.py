from app.core.config import settings
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
        "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.36, 48.86]]},
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
    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
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
    dense_coords = [[2.35 + i * 0.0001, 48.85 + i * 0.0001] for i in range(settings.max_waypoints * 5)]

    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(distance=20000.0, coords=dense_coords)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000}
    )
    data = resp.json()
    assert data["simplified"] is True
    # Un emplacement reste volontairement libre sous settings.max_waypoints,
    # pour qu'une mutation ultérieure (ajouter un point, par exemple) ne
    # heurte pas aussitôt cette même limite sur /compute.
    assert len(data["waypoints"]) <= settings.max_waypoints - 1


def test_round_trip_not_simplified_for_short_track(client, monkeypatch):
    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
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
    dense_coords = [[2.35 + i * 0.0001, 48.85 + i * 0.0001] for i in range(settings.max_waypoints * 5)]

    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(distance=20000.0, coords=dense_coords)

    async def fake_route(points, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False):
        return _fake_path(distance=20000.0, coords=[[2.35, 48.85], [2.36, 48.86]])

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)
    monkeypatch.setattr(routes_module.graphhopper_client, "route", fake_route)

    resp = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000}
    )
    data = resp.json()
    waypoints = data["waypoints"]
    assert len(waypoints) < settings.max_waypoints  # marge réservée à la génération

    follow_up = client.post(
        "/api/routes/compute",
        json={"waypoints": [{"lat": w["lat"], "lon": w["lon"]} for w in waypoints] + [{"lat": 48.9, "lon": 2.4}]},
    )
    assert follow_up.status_code == 200


def test_round_trip_inserts_via_points_in_the_generated_circuit(client, monkeypatch):
    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(distance=20000.0)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip",
        json={
            "start": {"lat": 48.85, "lon": 2.35},
            "distance_m": 20000,
            "via_points": [{"lat": 48.87, "lon": 2.34}, {"lat": 48.90, "lon": 2.40}],
        },
    )
    assert resp.status_code == 200
    waypoints = [(w["lat"], w["lon"]) for w in resp.json()["waypoints"]]
    assert (48.87, 2.34) in waypoints
    assert (48.90, 2.40) in waypoints


def test_round_trip_leg_boundaries_dropped_when_via_points_are_inserted(client, monkeypatch):
    # Les points de passage ne sont pas sur le tracé généré : garder les
    # bornes de legs décrivant les seuls waypoints échantillonnés les aurait
    # laissées décalées d'un cran par point inséré, donc fausses.
    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(distance=20000.0)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip",
        json={
            "start": {"lat": 48.85, "lon": 2.35},
            "distance_m": 20000,
            "via_points": [{"lat": 48.87, "lon": 2.34}],
        },
    )
    assert resp.json()["leg_boundaries"] == []


def test_round_trip_reserves_room_for_via_points_under_max_waypoints(client, monkeypatch):
    # Régression : l'échantillonnage visait max_waypoints - 1 sans tenir
    # compte des points de passage ajoutés ensuite — un circuit dense assorti
    # de plusieurs points de passage dépassait le plafond, et le recalcul
    # automatique déclenché juste après échouait en "Trop de waypoints".
    dense_coords = [[2.35 + i * 0.0001, 48.85 + i * 0.0001] for i in range(settings.max_waypoints * 5)]
    via_points = [{"lat": 48.80 + i * 0.01, "lon": 2.30} for i in range(5)]

    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(distance=20000.0, coords=dense_coords)

    async def fake_route(points, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False):
        return _fake_path(distance=20000.0, coords=[[2.35, 48.85], [2.36, 48.86]])

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)
    monkeypatch.setattr(routes_module.graphhopper_client, "route", fake_route)

    resp = client.post(
        "/api/routes/round-trip",
        json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000, "via_points": via_points},
    )
    waypoints = resp.json()["waypoints"]
    assert len(waypoints) < settings.max_waypoints  # marge conservée malgré les points de passage

    follow_up = client.post(
        "/api/routes/compute",
        json={"waypoints": [{"lat": w["lat"], "lon": w["lon"]} for w in waypoints]},
    )
    assert follow_up.status_code == 200


def test_round_trip_rejects_via_point_outside_france(client):
    resp = client.post(
        "/api/routes/round-trip",
        json={
            "start": {"lat": 48.85, "lon": 2.35},
            "distance_m": 20000,
            "via_points": [{"lat": 60.0, "lon": 2.35}],
        },
    )
    assert resp.status_code == 400


def test_round_trip_rejects_too_many_via_points(client):
    resp = client.post(
        "/api/routes/round-trip",
        json={
            "start": {"lat": 48.85, "lon": 2.35},
            "distance_m": 20000,
            "via_points": [
                {"lat": 48.85, "lon": 2.35} for _ in range(settings.max_round_trip_via_points + 1)
            ],
        },
    )
    assert resp.status_code == 400


def test_round_trip_passes_avoid_zones_to_graphhopper_client(client, monkeypatch):
    # Régression : RoundTripRequest n'avait pas de champ avoid_zones, la
    # génération de circuit ignorait donc totalement les zones à éviter déjà
    # définies, contrairement au calcul d'itinéraire classique.
    received = {}

    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        received["avoid_zones"] = avoid_zones
        return _fake_path(distance=20000.0)

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    resp = client.post(
        "/api/routes/round-trip",
        json={
            "start": {"lat": 48.85, "lon": 2.35},
            "distance_m": 20000,
            "avoid_zones": [{"lat": 48.86, "lon": 2.36, "radius_m": 300}],
        },
    )
    assert resp.status_code == 200
    assert len(received["avoid_zones"]) == 1
    assert received["avoid_zones"][0].lat == 48.86


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
    async def fake_alternatives(points, profile=None, no_speed_limit=False):
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


def test_list_routes_returns_created_routes(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()

    resp = client.get("/api/routes")
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert created["id"] in ids


def test_delete_route_removes_it(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()

    resp = client.delete(f"/api/routes/{created['id']}")
    assert resp.status_code == 204

    assert client.get(f"/api/routes/{created['id']}").status_code == 404
    assert created["id"] not in [r["id"] for r in client.get("/api/routes").json()]


def test_delete_route_missing_returns_404(client):
    resp = client.delete("/api/routes/999999")
    assert resp.status_code == 404


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


def test_compute_route_rejects_speed_limit_below_minimum(client):
    resp = client.post(
        "/api/routes/compute",
        json={
            "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}],
            "speed_limit_kmh": 10,
        },
    )
    assert resp.status_code == 422


def test_compute_route_rejects_speed_limit_above_maximum(client):
    resp = client.post(
        "/api/routes/compute",
        json={
            "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}],
            "speed_limit_kmh": 90,
        },
    )
    assert resp.status_code == 422


def test_create_route_persists_speed_limit_settings(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    payload["speed_limit_kmh"] = 60
    created = client.post("/api/routes", json=payload).json()
    assert created["speed_limit_kmh"] == 60
    assert created["no_speed_limit"] is False

    fetched = client.get(f"/api/routes/{created['id']}").json()
    assert fetched["speed_limit_kmh"] == 60


def test_create_route_defaults_no_speed_limit_settings(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()
    assert created["speed_limit_kmh"] is None
    assert created["no_speed_limit"] is False


def test_create_route_rejects_name_too_long(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    payload["name"] = "x" * 201
    resp = client.post("/api/routes", json=payload)
    assert resp.status_code == 422


def test_create_route_rejects_oversized_geometry(client):
    # Backend exposé sans authentification sur le LAN : cette borne empêche
    # un client de remplir la base avec un champ de plusieurs centaines de Mo.
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    payload["geometry_geojson"] = {"type": "LineString", "coordinates": [[2.35, 48.85]] * 400_000}
    resp = client.post("/api/routes", json=payload)
    assert resp.status_code == 422


def test_update_route_rejects_waypoints_without_matching_route_data(client):
    # Régression : distance_m/duration_s/geometry_geojson étaient écrits
    # inconditionnellement dès que waypoints était fourni, les mettant à None
    # (ou "null" pour geometry_geojson) si absents de la requête — corrompant
    # le trajet (GET ultérieur en 500, RouteOut les déclare non-optionnels).
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()

    resp = client.put(
        f"/api/routes/{created['id']}",
        json={"waypoints": [{"lat": 48.87, "lon": 2.37}, {"lat": 48.88, "lon": 2.38}]},
    )
    assert resp.status_code == 422

    fetched = client.get(f"/api/routes/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["geometry_geojson"] == payload["geometry_geojson"]


def test_update_route_replaces_speed_limit_settings(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()

    resp = client.put(
        f"/api/routes/{created['id']}",
        json={"no_speed_limit": True, "speed_limit_kmh": None},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["no_speed_limit"] is True
    assert body["speed_limit_kmh"] is None


def test_round_trip_leg_boundaries_match_returned_waypoints(client, monkeypatch):
    # Régression : les bornes venaient de snapped_waypoints (le seul point de
    # départ demandé) et ne correspondaient pas aux waypoints renvoyés.
    dense_coords = [[2.35 + i * 0.0001, 48.85 + i * 0.0001] for i in range(settings.max_waypoints * 5)]

    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        path = _fake_path(distance=20000.0, coords=dense_coords)
        path["snapped_waypoints"] = {"coordinates": [dense_coords[0]]}
        return path

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)

    data = client.post(
        "/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 20000}
    ).json()
    boundaries = data["leg_boundaries"]
    assert len(boundaries) == len(data["waypoints"])
    assert boundaries[0] == 0
    assert boundaries[-1] == len(dense_coords) - 1
    for index, waypoint in zip(boundaries, data["waypoints"]):
        assert dense_coords[index] == [waypoint["lon"], waypoint["lat"]]


def test_round_trip_accepts_coordinates_with_elevation(client, monkeypatch):
    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(coords=[[2.35, 48.85, 30.0], [2.36, 48.86, 31.0], [2.35, 48.85, 30.0]])

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)
    resp = client.post("/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 5000})
    assert resp.status_code == 200
    assert resp.json()["waypoints"][1] == {"lat": 48.86, "lon": 2.36, "label": None}


def test_round_trip_rejects_degenerate_path(client, monkeypatch):
    async def fake_round_trip(
        start, distance_m, seed=None, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False
    ):
        return _fake_path(coords=[[2.35, 48.85]])

    monkeypatch.setattr(routes_module.graphhopper_client, "route_round_trip", fake_round_trip)
    resp = client.post("/api/routes/round-trip", json={"start": {"lat": 48.85, "lon": 2.35}, "distance_m": 5000})
    assert resp.status_code == 422


def test_compute_route_maps_graphhopper_errors(client, monkeypatch):
    from app.services.graphhopper_client import (
        UNAVAILABLE_MESSAGE,
        GraphHopperRouteNotFoundError,
        GraphHopperUnavailableError,
    )

    body = {"waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]}

    async def not_found(*args, **kwargs):
        raise GraphHopperRouteNotFoundError("Aucun itinéraire")

    monkeypatch.setattr(routes_module.graphhopper_client, "route", not_found)
    resp = client.post("/api/routes/compute", json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Aucun itinéraire"

    async def unavailable(*args, **kwargs):
        raise GraphHopperUnavailableError(UNAVAILABLE_MESSAGE)

    monkeypatch.setattr(routes_module.graphhopper_client, "route", unavailable)
    resp = client.post("/api/routes/compute", json=body)
    assert resp.status_code == 503
    assert resp.json()["detail"] == UNAVAILABLE_MESSAGE


def test_get_missing_route_returns_404(client):
    assert client.get("/api/routes/999999").status_code == 404


def test_list_routes_summary_view_omits_heavy_fields(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    created = client.post("/api/routes", json=payload).json()

    resp = client.get("/api/routes", params={"view": "summary"})
    assert resp.status_code == 200
    item = next(r for r in resp.json() if r["id"] == created["id"])
    assert set(item) == {"id", "name", "description", "distance_m", "duration_s", "is_favorite", "created_at", "updated_at"}
    assert item["created_at"].endswith("Z")


def test_list_routes_full_view_remains_the_default(client):
    payload = _route_payload([{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}])
    client.post("/api/routes", json=payload)
    assert "geometry_geojson" in client.get("/api/routes").json()[0]


def test_list_routes_rejects_unknown_view(client):
    assert client.get("/api/routes", params={"view": "tout"}).status_code == 422


def test_business_rule_violation_is_mapped_to_400(client):
    resp = client.post("/api/routes/compute", json={"waypoints": [{"lat": 60.0, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]})
    assert resp.status_code == 400
    assert "Latitude hors de France" in resp.json()["detail"]
