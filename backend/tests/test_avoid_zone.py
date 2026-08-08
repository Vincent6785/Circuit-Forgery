import math

from app.schemas.route import AvoidZone
from app.services.avoid_zone import build_custom_model, circle_to_polygon

_EARTH_RADIUS_M = 6_371_000


def _haversine_m(lat1, lon1, lat2, lon2):
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(
        d_lon / 2
    ) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def test_circle_to_polygon_is_closed_with_n_plus_one_points():
    coords = circle_to_polygon(48.85, 2.35, 1000, n=12)
    assert len(coords) == 13
    assert coords[0] == coords[-1]


def test_circle_to_polygon_points_are_roughly_radius_away():
    lat, lon, radius = 48.85, 2.35, 1000.0
    coords = circle_to_polygon(lat, lon, radius, n=8)
    for plon, plat in coords[:-1]:
        dist = _haversine_m(lat, lon, plat, plon)
        assert abs(dist - radius) < radius * 0.05


def test_build_custom_model_structure():
    zones = [
        AvoidZone(lat=48.85, lon=2.35, radius_m=500),
        AvoidZone(lat=45.0, lon=5.0, radius_m=200),
    ]
    model = build_custom_model(zones)
    assert set(model["areas"].keys()) == {"avoid_0", "avoid_1"}
    assert model["areas"]["avoid_0"]["geometry"]["type"] == "Polygon"
    assert model["priority"] == [
        {"if": "in_avoid_0", "multiply_by": "0"},
        {"if": "in_avoid_1", "multiply_by": "0"},
    ]


def test_build_custom_model_empty_list():
    model = build_custom_model([])
    assert model == {"areas": {}, "priority": []}
