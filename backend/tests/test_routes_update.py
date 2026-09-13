import pytest

from app.core.config import settings

WAYPOINTS = [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]
GEOMETRY = {"type": "LineString", "coordinates": [[2.35, 48.85], [2.36, 48.86]]}


def _create(client, **overrides):
    payload = {
        "name": "Trajet",
        "description": "Notes",
        "waypoints": WAYPOINTS,
        "distance_m": 1000,
        "duration_s": 60,
        "geometry_geojson": GEOMETRY,
        "speed_limit_kmh": 60,
    }
    payload.update(overrides)
    resp = client.post("/api/routes", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _put(client, route_id, body):
    return client.put(f"/api/routes/{route_id}", json=body)


def test_update_clears_description_with_null(client):
    # Régression : "if body.description is not None" rendait l'effacement impossible.
    route = _create(client)
    resp = _put(client, route["id"], {"description": None})
    assert resp.status_code == 200
    assert resp.json()["description"] is None


def test_update_keeps_fields_absent_from_request(client):
    route = _create(client)
    updated = _put(client, route["id"], {"name": "Nouveau nom"}).json()
    assert updated["name"] == "Nouveau nom"
    assert updated["description"] == "Notes"
    assert updated["waypoints"] == route["waypoints"]
    assert updated["speed_limit_kmh"] == 60


def test_update_speed_limit_alone(client):
    # Régression : speed_limit_kmh sans no_speed_limit était ignoré silencieusement.
    route = _create(client)
    updated = _put(client, route["id"], {"speed_limit_kmh": 50}).json()
    assert updated["speed_limit_kmh"] == 50
    assert updated["no_speed_limit"] is False


@pytest.mark.parametrize(
    "body",
    [
        {"distance_m": 5},
        {"geometry_geojson": GEOMETRY},
        {"waypoints": WAYPOINTS, "distance_m": 5, "duration_s": 1},
    ],
)
def test_update_rejects_partial_route_data(client, body):
    route = _create(client)
    assert _put(client, route["id"], body).status_code == 422


@pytest.mark.parametrize("field", ["name", "is_favorite", "no_speed_limit", "waypoints"])
def test_update_rejects_null_for_non_nullable_fields(client, field):
    route = _create(client)
    assert _put(client, route["id"], {field: None}).status_code == 422


def test_update_with_full_route_data_replaces_track(client):
    route = _create(client)
    new_waypoints = [{"lat": 48.87, "lon": 2.37}, {"lat": 48.88, "lon": 2.38, "label": "Arrivée"}]
    new_geometry = {"type": "LineString", "coordinates": [[2.37, 48.87], [2.38, 48.88]]}
    updated = _put(
        client,
        route["id"],
        {"waypoints": new_waypoints, "distance_m": 2500, "duration_s": 300, "geometry_geojson": new_geometry},
    ).json()
    assert updated["distance_m"] == 2500
    assert updated["geometry_geojson"] == new_geometry
    assert updated["waypoints"][1]["label"] == "Arrivée"
    assert updated["updated_at"] is not None


def test_update_sets_updated_at_on_content_change_but_not_on_favorite(client):
    route = _create(client)
    favorite = _put(client, route["id"], {"is_favorite": True}).json()
    assert favorite["is_favorite"] is True
    assert favorite["updated_at"] is None

    renamed = _put(client, route["id"], {"name": "Renommé"}).json()
    assert renamed["updated_at"] is not None
    assert renamed["updated_at"].endswith("Z")


def test_update_with_invalid_avoid_zones_leaves_route_unchanged(client):
    # Régression : la validation avait lieu après avoir déjà modifié le nom.
    route = _create(client)
    resp = _put(
        client,
        route["id"],
        {"name": "Ne doit pas s'appliquer", "avoid_zones": [{"lat": 60.0, "lon": 2.35, "radius_m": 100}]},
    )
    assert resp.status_code == 400
    assert client.get(f"/api/routes/{route['id']}").json()["name"] == "Trajet"


def test_update_no_speed_limit_updates_profile(client):
    route = _create(client)
    updated = _put(client, route["id"], {"no_speed_limit": True, "speed_limit_kmh": None}).json()
    assert updated["profile"] == settings.graphhopper_no_limit_profile
    assert updated["speed_limit_kmh"] is None


def test_update_with_empty_body_changes_nothing(client):
    route = _create(client)
    updated = _put(client, route["id"], {}).json()
    assert updated["updated_at"] is None
    assert updated["name"] == route["name"]


def test_update_missing_route_returns_404(client):
    assert _put(client, 999999, {"name": "x"}).status_code == 404
