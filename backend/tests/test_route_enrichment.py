from app.schemas.route import Waypoint
from app.services.route_enrichment import _leg_boundaries, path_to_response


def test_leg_boundaries_simple_case():
    coordinates = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]
    snapped = [[0, 0], [2, 2], [4, 4]]
    assert _leg_boundaries(coordinates, snapped) == [0, 2, 4]


def test_leg_boundaries_monotonic_cursor_handles_loop():
    # Le trajet repasse près du point de départ (boucle) : le curseur ne doit
    # jamais revenir en arrière même si un point plus proche existe avant lui.
    coordinates = [[0, 0], [1, 0], [2, 0], [1, 0.01], [0, 0.01]]
    snapped = [[0, 0], [2, 0], [0, 0.01]]
    boundaries = _leg_boundaries(coordinates, snapped)
    assert boundaries == [0, 2, 4]
    assert boundaries == sorted(boundaries)


def test_path_to_response_computes_leg_boundaries_from_snapped_waypoints():
    path = {
        "distance": 1000.0,
        "time": 60000,
        "points": {"type": "LineString", "coordinates": [[0, 0], [1, 1], [2, 2]]},
        "snapped_waypoints": {"coordinates": [[0, 0], [2, 2]]},
        "details": {},
    }
    response = path_to_response(path)
    assert response.leg_boundaries == [0, 2]
    assert response.distance_m == 1000.0
    assert response.duration_s == 60.0


def test_path_to_response_without_snapped_waypoints_returns_empty_boundaries():
    path = {
        "distance": 500.0,
        "time": 30000,
        "points": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        "details": {},
    }
    response = path_to_response(path)
    assert response.leg_boundaries == []


def test_path_to_response_cumulative_distance_starts_at_zero_and_is_increasing():
    path = {
        "distance": 1000.0,
        "time": 60000,
        "points": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]]},
        "details": {},
    }
    response = path_to_response(path)
    assert len(response.cumulative_distance_m) == 3
    assert response.cumulative_distance_m[0] == 0.0
    assert response.cumulative_distance_m[1] > 0
    assert response.cumulative_distance_m[2] > response.cumulative_distance_m[1]


def test_path_to_response_waypoints_default_empty():
    path = {
        "distance": 500.0,
        "time": 30000,
        "points": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        "details": {},
    }
    assert path_to_response(path).waypoints == []


def test_path_to_response_waypoints_passthrough():
    path = {
        "distance": 500.0,
        "time": 30000,
        "points": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        "details": {},
    }
    waypoints = [Waypoint(lat=48.85, lon=2.35), Waypoint(lat=48.86, lon=2.36)]
    response = path_to_response(path, waypoints=waypoints)
    assert response.waypoints == waypoints
