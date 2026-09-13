import math

from app.core.errors import _json_safe

WAYPOINTS = [{"lat": 48.85, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]


def test_json_safe_stringifies_non_finite_floats_and_objects():
    value = {"a": math.nan, "b": [math.inf, -math.inf, 1.5], "c": ValueError("boom"), 3: None, "d": (True, "x")}
    assert _json_safe(value) == {"a": "nan", "b": ["inf", "-inf", 1.5], "c": "boom", "3": None, "d": [True, "x"]}


def test_validation_error_response_omits_rejected_input(client):
    # La valeur refusée n'est pas renvoyée : elle peut peser plusieurs Mo.
    waypoints = [{"lat": 48.85, "lon": 2.35, "label": "x" * 201}, WAYPOINTS[1]]
    resp = client.post("/api/routes/compute", json={"waypoints": waypoints})
    assert resp.status_code == 422
    errors = resp.json()["detail"]
    assert errors
    assert all("input" not in error for error in errors)
    assert errors[0]["loc"] == ["body", "waypoints", 0, "label"]
    assert isinstance(errors[0]["msg"], str)


def test_validation_error_with_nan_input_returns_422_not_500(client):
    resp = client.post(
        "/api/routes/compute",
        content='{"waypoints": [{"lat": NaN, "lon": 2.35}, {"lat": 48.86, "lon": 2.36}]}',
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 422


def test_model_validator_error_context_is_serializable(client):
    created = client.post(
        "/api/routes",
        json={
            "name": "Trajet",
            "waypoints": WAYPOINTS,
            "distance_m": 1,
            "duration_s": 1,
            "geometry_geojson": {"type": "LineString", "coordinates": [[2.35, 48.85], [2.36, 48.86]]},
        },
    ).json()
    resp = client.put(f"/api/routes/{created['id']}", json={"distance_m": 5})
    assert resp.status_code == 422
    assert "fournis ensemble" in resp.json()["detail"][0]["msg"]
