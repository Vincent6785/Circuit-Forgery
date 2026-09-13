from datetime import datetime

import pytest

from app.core.config import settings

VALID_WAYPOINTS = [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]
VALID_GEOMETRY = {"type": "LineString", "coordinates": [[2.35, 48.85], [2.36, 48.86]]}


def _route(**overrides):
    payload = {
        "name": "Trajet",
        "waypoints": VALID_WAYPOINTS,
        "distance_m": 1000,
        "duration_s": 60,
        "geometry_geojson": VALID_GEOMETRY,
    }
    payload.update(overrides)
    return payload


def _post_raw_json(client, url, text):
    # Le décodeur JSON accepte NaN et Infinity : il faut les envoyer tels quels.
    return client.post(url, content=text, headers={"Content-Type": "application/json"})


def test_compute_rejects_nan_avoid_zone_radius(client):
    # Régression : "radius_m <= 0 or radius_m > max" est faux pour NaN, qui
    # passait la validation et produisait un polygone NaN envoyé à GraphHopper.
    text = (
        '{"waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}], '
        '"avoid_zones": [{"lat": 48.85, "lon": 2.35, "radius_m": NaN}]}'
    )
    assert _post_raw_json(client, "/api/routes/compute", text).status_code == 422


def test_compute_rejects_infinite_coordinate(client):
    text = '{"waypoints": [{"lat": Infinity, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]}'
    assert _post_raw_json(client, "/api/routes/compute", text).status_code == 422


@pytest.mark.parametrize("radius", [0, -10])
def test_compute_rejects_non_positive_radius(client, radius):
    body = {"waypoints": VALID_WAYPOINTS, "avoid_zones": [{"lat": 48.85, "lon": 2.35, "radius_m": radius}]}
    assert client.post("/api/routes/compute", json=body).status_code == 422


def test_compute_rejects_label_too_long(client):
    waypoints = [{"lat": 48.85, "lon": 2.35, "label": "x" * 201}, VALID_WAYPOINTS[1]]
    assert client.post("/api/routes/compute", json={"waypoints": waypoints}).status_code == 422


def test_compute_rejects_latitude_outside_world_bounds(client):
    waypoints = [{"lat": 91, "lon": 2.35}, VALID_WAYPOINTS[1]]
    assert client.post("/api/routes/compute", json={"waypoints": waypoints}).status_code == 422


@pytest.mark.parametrize(
    "geometry",
    [
        {"type": "Point", "coordinates": [2.35, 48.85]},
        {"type": "LineString", "coordinates": [[2.35, 48.85]]},
        {"type": "LineString", "coordinates": [["a", "b"], [2.36, 48.86]]},
        {"type": "LineString", "coordinates": [[2.35], [2.36, 48.86]]},
        {"type": "LineString", "coordinates": [[2.35, 48.85, 1, 2], [2.36, 48.86]]},
        {"type": "LineString"},
    ],
)
def test_create_route_rejects_invalid_geometry(client, geometry):
    assert client.post("/api/routes", json=_route(geometry_geojson=geometry)).status_code == 422


def test_create_route_accepts_geometry_with_elevation_and_exports_it(client):
    geometry = {"type": "LineString", "coordinates": [[2.35, 48.85, 35.0], [2.36, 48.86, 40.0]]}
    created = client.post("/api/routes", json=_route(geometry_geojson=geometry))
    assert created.status_code == 201

    # Régression : l'export GPX déballait chaque coordonnée en (lon, lat) et
    # plantait en 500 sur une coordonnée à trois valeurs.
    exported = client.get(f"/api/routes/{created.json()['id']}/export.gpx")
    assert exported.status_code == 200
    assert 'lat="48.860000" lon="2.360000"' in exported.text


def test_create_route_rejects_nan_distance(client):
    text = (
        '{"name": "Trajet", "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}], '
        '"distance_m": NaN, "duration_s": 60, '
        '"geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.36, 48.86]]}}'
    )
    assert _post_raw_json(client, "/api/routes", text).status_code == 422


@pytest.mark.parametrize("field", ["distance_m", "duration_s"])
def test_create_route_rejects_negative_measures(client, field):
    assert client.post("/api/routes", json=_route(**{field: -1})).status_code == 422


@pytest.mark.parametrize("name", ["", "   "])
def test_create_route_rejects_blank_name(client, name):
    assert client.post("/api/routes", json=_route(name=name)).status_code == 422


def test_create_route_trims_name(client):
    assert client.post("/api/routes", json=_route(name="  Col du Galibier  ")).json()["name"] == "Col du Galibier"


def test_create_route_profile_reflects_no_speed_limit(client):
    limited = client.post("/api/routes", json=_route()).json()
    unlimited = client.post("/api/routes", json=_route(no_speed_limit=True)).json()
    assert limited["profile"] == settings.graphhopper_profile
    assert unlimited["profile"] == settings.graphhopper_no_limit_profile


def test_create_route_ignores_client_supplied_profile(client):
    created = client.post("/api/routes", json=_route(profile="car")).json()
    assert created["profile"] == settings.graphhopper_profile


def test_route_timestamps_are_utc(client):
    # Régression : SQLite rendait un horodatage naïf, sérialisé sans fuseau,
    # que le navigateur interprétait comme une heure locale.
    created = client.post("/api/routes", json=_route()).json()
    assert created["created_at"].endswith("Z")
    assert datetime.fromisoformat(created["created_at"]).tzinfo is not None
