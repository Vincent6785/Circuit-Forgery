import json

import httpx
import pytest
import respx

from app.schemas.route import AvoidZone
from app.services.graphhopper_client import (
    GraphHopperClient,
    GraphHopperRouteNotFoundError,
    GraphHopperUnavailableError,
)

BASE_URL = "http://gh-test:8989"


def _client():
    return GraphHopperClient(base_url=BASE_URL)


def _path(distance=1000.0, coords=None):
    return {
        "distance": distance,
        "time": 60000,
        "points": {"type": "LineString", "coordinates": coords or [[0, 0], [1, 1]]},
        "details": {},
    }


@respx.mock
async def test_route_uses_get_without_avoid_zones():
    route = respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(200, json={"paths": [_path()]}))
    result = await _client().route([(0, 0), (1, 1)])
    assert route.called
    assert result["distance"] == 1000.0


@respx.mock
async def test_route_uses_post_with_avoid_zones_and_merges_custom_model():
    route = respx.post(f"{BASE_URL}/route").mock(return_value=httpx.Response(200, json={"paths": [_path()]}))
    zones = [AvoidZone(lat=48.85, lon=2.35, radius_m=500)]
    result = await _client().route([(0, 0), (1, 1)], avoid_zones=zones)
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert "custom_model" in body
    assert "avoid_0" in body["custom_model"]["areas"]
    assert result["distance"] == 1000.0


@respx.mock
async def test_route_uses_post_with_speed_limit_even_without_zones():
    route = respx.post(f"{BASE_URL}/route").mock(return_value=httpx.Response(200, json={"paths": [_path()]}))
    result = await _client().route([(0, 0), (1, 1)], speed_limit_kmh=60)
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body["custom_model"]["priority"] == [
        {"if": "max_speed > 60 && max_speed < 1000", "multiply_by": "0"}
    ]
    assert result["distance"] == 1000.0


@respx.mock
async def test_route_ignores_speed_limit_at_default_stays_get():
    route = respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(200, json={"paths": [_path()]}))
    await _client().route([(0, 0), (1, 1)], speed_limit_kmh=80)
    assert route.called


@respx.mock
async def test_route_switches_profile_for_no_speed_limit_and_stays_get():
    route = respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(200, json={"paths": [_path()]}))
    await _client().route([(0, 0), (1, 1)], no_speed_limit=True)
    assert route.called
    assert route.calls.last.request.url.params["profile"] == "moto_no_limit"


@respx.mock
async def test_route_no_speed_limit_ignores_speed_limit_kmh():
    route = respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(200, json={"paths": [_path()]}))
    await _client().route([(0, 0), (1, 1)], speed_limit_kmh=50, no_speed_limit=True)
    assert route.called  # reste en GET : pas de custom_model, le seuil est ignoré


@respx.mock
async def test_route_maps_400_to_route_not_found():
    respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(400, json={"message": "no route"}))
    with pytest.raises(GraphHopperRouteNotFoundError):
        await _client().route([(0, 0), (1, 1)])


@respx.mock
async def test_route_maps_5xx_to_unavailable():
    respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(500, text="boom"))
    with pytest.raises(GraphHopperUnavailableError):
        await _client().route([(0, 0), (1, 1)])


@respx.mock
async def test_route_round_trip_sends_algorithm_and_distance():
    route = respx.get(f"{BASE_URL}/route").mock(
        return_value=httpx.Response(200, json={"paths": [_path(distance=20000.0)]})
    )
    result = await _client().route_round_trip((48.85, 2.35), distance_m=20000, seed=42)
    sent = route.calls.last.request.url.params
    assert sent["algorithm"] == "round_trip"
    assert sent["round_trip.distance"] == "20000"
    assert sent["round_trip.seed"] == "42"
    assert result["distance"] == 20000.0


@respx.mock
async def test_route_round_trip_uses_post_with_speed_limit():
    route = respx.post(f"{BASE_URL}/route").mock(
        return_value=httpx.Response(200, json={"paths": [_path(distance=20000.0)]})
    )
    result = await _client().route_round_trip((48.85, 2.35), distance_m=20000, speed_limit_kmh=50)
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body["algorithm"] == "round_trip"
    # Format attendu par un corps JSON POST ("points": liste de [lon, lat]) —
    # pas "point" (chaîne "lat,lon"), qui n'est valide qu'en paramètre GET et
    # que GraphHopper rejette côté POST avec "You have to pass at least one point".
    assert body["points"] == [[2.35, 48.85]]
    assert "point" not in body
    assert body["custom_model"]["priority"] == [
        {"if": "max_speed > 50 && max_speed < 1000", "multiply_by": "0"}
    ]
    assert result["distance"] == 20000.0


@respx.mock
async def test_route_round_trip_switches_profile_for_no_speed_limit():
    route = respx.get(f"{BASE_URL}/route").mock(
        return_value=httpx.Response(200, json={"paths": [_path(distance=20000.0)]})
    )
    await _client().route_round_trip((48.85, 2.35), distance_m=20000, no_speed_limit=True)
    assert route.called
    assert route.calls.last.request.url.params["profile"] == "moto_no_limit"


@respx.mock
async def test_route_round_trip_maps_400_to_route_not_found():
    respx.get(f"{BASE_URL}/route").mock(return_value=httpx.Response(400, json={"message": "no route"}))
    with pytest.raises(GraphHopperRouteNotFoundError):
        await _client().route_round_trip((48.85, 2.35), distance_m=20000)


@respx.mock
async def test_route_alternatives_returns_all_paths():
    route = respx.get(f"{BASE_URL}/route").mock(
        return_value=httpx.Response(
            200, json={"paths": [_path(distance=1000.0), _path(distance=1200.0)]}
        )
    )
    results = await _client().route_alternatives([(0, 0), (1, 1)])
    assert len(results) == 2
    assert [r["distance"] for r in results] == [1000.0, 1200.0]
    assert route.calls.last.request.url.params["algorithm"] == "alternative_route"


@respx.mock
async def test_route_alternatives_switches_profile_for_no_speed_limit():
    route = respx.get(f"{BASE_URL}/route").mock(
        return_value=httpx.Response(200, json={"paths": [_path(distance=1000.0)]})
    )
    await _client().route_alternatives([(0, 0), (1, 1)], no_speed_limit=True)
    assert route.calls.last.request.url.params["profile"] == "moto_no_limit"
