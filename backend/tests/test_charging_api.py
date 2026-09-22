import pytest

from app.routers import routes as routes_module
from app.services import charging_route as charging_route_module
from app.services import charging_stations as charging_stations_module
from app.services.irve_client import IrveStation, IrveUnavailableError

EV = {"autonomy_km": 100, "recharge_interval_km": 20, "seconds_per_percent": 90}

# Tracé nord-sud rectiligne d'environ 44 km : assez long pour que deux
# recharges soient dues avec un intervalle de 20 km.
_LINE = [[2.35, 48.85 - i * 0.004] for i in range(101)]


def _path(coords=None, distance=44_000.0, snapped=None):
    coords = coords or _LINE
    path = {
        "distance": distance,
        "time": 3_600_000,
        "points": {"type": "LineString", "coordinates": coords},
        "details": {},
    }
    # GraphHopper renvoie un point accroché par point demandé : c'est ce qui
    # donne les bornes de legs.
    path["snapped_waypoints"] = {"coordinates": snapped or [coords[0], coords[-1]]}
    return path


def _station(station_id, lat, lon, name="Borne", power=50.0):
    return IrveStation(
        station_id=station_id,
        name=name,
        lat=lat,
        lon=lon,
        address="1 rue du Test",
        power_kw=power,
        point_count=2,
        two_wheeler=False,
    )


@pytest.fixture()
def fake_irve(monkeypatch):
    """Remplace l'appel à data.gouv par un parc de bornes tous les 0,02° le
    long du tracé de test — rien ne sort sur le réseau."""
    calls = []

    async def fake_stations_in_bbox(min_lat, min_lon, max_lat, max_lon):
        calls.append((min_lat, min_lon, max_lat, max_lon))
        stations = []
        step = 0.02
        lat = (int(min_lat / step) + 1) * step
        while lat < max_lat:
            if min_lon <= 2.35 <= max_lon:
                stations.append(_station(f"FR{lat:.4f}", lat, 2.35, name=f"Borne {lat:.3f}"))
            lat += step
        return stations, False

    monkeypatch.setattr(
        charging_stations_module.irve_client, "stations_in_bbox", fake_stations_in_bbox
    )
    return calls


@pytest.fixture()
def fake_graphhopper(monkeypatch):
    """Renvoie un tracé cohérent avec le nombre de points demandés, pour que
    les bornes de legs aient autant d'entrées que de points."""
    calls = []

    async def fake_route(points, profile=None, avoid_zones=None, speed_limit_kmh=None, no_speed_limit=False):
        calls.append(list(points))
        snapped = [[lon, lat] for lat, lon in points]
        return _path(snapped=snapped)

    monkeypatch.setattr(routes_module.graphhopper_client, "route", fake_route)
    monkeypatch.setattr(charging_route_module.graphhopper_client, "route", fake_route)
    return calls


def _compute(client, ev=EV, waypoints=None):
    return client.post(
        "/api/routes/compute",
        json={
            "waypoints": waypoints or [{"lat": 48.85, "lon": 2.35}, {"lat": 48.45, "lon": 2.35}],
            "ev": ev,
        },
    )


def test_compute_without_ev_keeps_the_previous_behaviour(client, fake_graphhopper, fake_irve):
    resp = client.post(
        "/api/routes/compute",
        json={"waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.45, "lon": 2.35}]},
    )
    data = resp.json()
    assert data["charging_stops"] == []
    assert data["charging_duration_s"] == 0
    assert data["charging_max_gap_m"] is None
    # Un seul appel au moteur de routage : pas de second calcul inutile.
    assert len(fake_graphhopper) == 1


def test_compute_inserts_charging_stops_along_the_route(client, fake_graphhopper, fake_irve):
    data = _compute(client).json()
    assert data["charging_stops"], "au moins un arrêt attendu sur 44 km avec un intervalle de 20 km"
    assert data["charging_unplaced"] == 0
    assert data["charging_unavailable"] is False
    # Second calcul GraphHopper : le tracé passe réellement par les bornes.
    assert len(fake_graphhopper) == 2
    assert len(fake_graphhopper[1]) == len(fake_graphhopper[0]) + len(data["charging_stops"])


def test_charging_duration_follows_the_autonomy_and_the_charge_speed(client, fake_graphhopper, fake_irve):
    data = _compute(client).json()
    stop = data["charging_stops"][0]
    # 20 km sur 100 km d'autonomie = 20 % à regagner, à 90 s le pourcent.
    assert stop["charge_percent"] == pytest.approx(20)
    assert stop["charge_duration_s"] == pytest.approx(1800)
    assert data["charging_duration_s"] == pytest.approx(1800 * len(data["charging_stops"]))


def test_leg_boundaries_describe_the_user_points_only(client, fake_graphhopper, fake_irve):
    # Les arrêts recharge ne sont pas des points du trajet : les inclure
    # décalait les bornes de legs, donc les distances par étape affichées et
    # l'endroit où un glisser sur le tracé insère une nouvelle étape.
    data = _compute(client).json()
    assert data["charging_stops"]
    assert len(data["leg_boundaries"]) == 2


def test_charging_stops_are_ordered_along_the_route(client, fake_graphhopper, fake_irve):
    data = _compute(client).json()
    distances = [stop["route_distance_m"] for stop in data["charging_stops"]]
    assert distances == sorted(distances)


def test_the_same_station_is_never_used_twice(client, fake_graphhopper, fake_irve):
    data = _compute(client).json()
    names = [stop["name"] for stop in data["charging_stops"]]
    assert len(names) == len(set(names))


def test_compute_rejects_an_interval_beyond_the_autonomy(client, fake_graphhopper, fake_irve):
    resp = _compute(client, ev={"autonomy_km": 50, "recharge_interval_km": 80, "seconds_per_percent": 90})
    assert resp.status_code == 400
    assert "autonomie" in resp.json()["detail"].lower()


def test_compute_rejects_nonsensical_ev_values(client):
    resp = _compute(client, ev={"autonomy_km": 0, "recharge_interval_km": 20, "seconds_per_percent": 90})
    assert resp.status_code == 422


def test_route_is_still_returned_when_datagouv_is_down(client, fake_graphhopper, monkeypatch):
    # Une panne de la base des bornes ne doit pas priver l'utilisateur de son
    # itinéraire : le trajet passe, le drapeau dit pourquoi il n'a pas d'arrêt.
    async def boom(*_args, **_kwargs):
        raise IrveUnavailableError("indisponible")

    monkeypatch.setattr(charging_stations_module.irve_client, "stations_in_bbox", boom)

    data = _compute(client).json()
    assert data["charging_unavailable"] is True
    assert data["charging_stops"] == []
    assert data["distance_m"] > 0
    assert len(fake_graphhopper) == 1


def test_no_station_anywhere_is_reported_as_unplaced(client, fake_graphhopper, monkeypatch):
    async def empty(*_args, **_kwargs):
        return [], False

    monkeypatch.setattr(charging_stations_module.irve_client, "stations_in_bbox", empty)

    data = _compute(client).json()
    assert data["charging_stops"] == []
    assert data["charging_unplaced"] >= 1
    assert data["charging_unavailable"] is False


def test_stations_are_cached_between_two_computations(client, fake_graphhopper, fake_irve):
    _compute(client)
    first_call_count = len(fake_irve)
    assert first_call_count > 0
    _compute(client)
    # Deuxième calcul identique : les cellules sont déjà en base, data.gouv
    # n'est plus sollicité.
    assert len(fake_irve) == first_call_count


def test_ev_settings_are_saved_and_returned_with_the_route(client):
    created = client.post(
        "/api/routes",
        json={
            "name": "trajet électrique",
            "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.45, "lon": 2.35}],
            "distance_m": 44000,
            "duration_s": 3600,
            "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.35, 48.45]]},
            "ev": EV,
        },
    )
    assert created.status_code == 201
    assert created.json()["ev"] == EV

    route_id = created.json()["id"]
    assert client.get(f"/api/routes/{route_id}").json()["ev"] == EV

    # Repasser en thermique s'écrit ev: null, comme pour les zones à éviter.
    updated = client.put(f"/api/routes/{route_id}", json={"ev": None})
    assert updated.status_code == 200
    assert updated.json()["ev"] is None


def test_a_route_saved_before_the_ev_mode_has_no_settings(client):
    created = client.post(
        "/api/routes",
        json={
            "name": "trajet thermique",
            "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.45, "lon": 2.35}],
            "distance_m": 44000,
            "duration_s": 3600,
            "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.35, 48.45]]},
        },
    )
    assert created.json()["ev"] is None


# --- Export GPX -------------------------------------------------------------

STOP = {
    "lat": 48.70,
    "lon": 2.35,
    "name": "Borne de test",
    "address": "1 rue du Test",
    "power_kw": 50.0,
    "point_count": 4,
    "two_wheeler": False,
    "detour_m": 320.0,
    "route_distance_m": 20500.0,
    "charge_percent": 20.0,
    "charge_duration_s": 1800.0,
}


def _saved_route_payload(name, **extra):
    payload = {
        "name": name,
        "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.45, "lon": 2.35}],
        "distance_m": 44000,
        "duration_s": 3600,
        "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.35, 48.45]]},
    }
    payload.update(extra)
    return payload


def test_current_route_export_includes_the_charging_stops(client):
    resp = client.post(
        "/api/gpx/export",
        json={
            "name": "trajet électrique",
            "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.45, "lon": 2.35}],
            "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.35, 48.45]]},
            "charging_stops": [STOP],
        },
    )
    assert resp.status_code == 200
    assert "<wpt" in resp.text
    assert "1. Borne de test" in resp.text


def test_saved_route_export_includes_its_charging_stops(client):
    # L'export d'un trajet sauvegardé passe par un autre endpoint que celui du
    # trajet courant : sans persistance, il perdait les arrêts.
    created = client.post("/api/routes", json=_saved_route_payload("ev-gpx", ev=EV, charging_stops=[STOP]))
    assert created.status_code == 201
    assert len(created.json()["charging_stops"]) == 1

    exported = client.get(f"/api/routes/{created.json()['id']}/export.gpx")
    assert exported.status_code == 200
    assert "1. Borne de test" in exported.text


def test_saved_thermal_route_export_has_no_charging_waypoint(client):
    created = client.post("/api/routes", json=_saved_route_payload("thermique-gpx"))
    exported = client.get(f"/api/routes/{created.json()['id']}/export.gpx")
    assert "<wpt" not in exported.text


def test_updating_the_route_replaces_its_charging_stops(client):
    # Les arrêts décrivent le tracé : les laisser en place après un nouveau
    # tracé exportait des bornes sans rapport avec l'itinéraire enregistré.
    created = client.post("/api/routes", json=_saved_route_payload("ev-maj", ev=EV, charging_stops=[STOP]))
    route_id = created.json()["id"]

    updated = client.put(
        f"/api/routes/{route_id}",
        json={
            "waypoints": [{"lat": 48.85, "lon": 2.35}, {"lat": 48.80, "lon": 2.35}],
            "distance_m": 6000,
            "duration_s": 600,
            "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.35, 48.80]]},
        },
    )
    assert updated.status_code == 200
    assert updated.json()["charging_stops"] == []
    assert "<wpt" not in client.get(f"/api/routes/{route_id}/export.gpx").text


def test_a_route_saved_before_the_ev_mode_exports_without_charging_stops(client, db_session):
    # Colonne charging_stops_json à NULL, comme pour un trajet enregistré par
    # une version antérieure.
    from app.db.models import Route

    route = db_session.get(
        Route, client.post("/api/routes", json=_saved_route_payload("ancien")).json()["id"]
    )
    assert route.charging_stops_json is None
    assert client.get(f"/api/routes/{route.id}/export.gpx").status_code == 200
