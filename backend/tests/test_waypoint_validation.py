import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.schemas.route import AvoidZone, Waypoint
from app.services.waypoint_validation import validate_avoid_zones, validate_waypoints


def test_validate_waypoints_accepts_points_within_france():
    validate_waypoints([Waypoint(lat=48.85, lon=2.35), Waypoint(lat=45.75, lon=4.85)])


def test_validate_waypoints_rejects_latitude_out_of_bounds():
    with pytest.raises(HTTPException) as exc_info:
        validate_waypoints([Waypoint(lat=60.0, lon=2.35), Waypoint(lat=48.85, lon=2.35)])
    assert exc_info.value.status_code == 400


def test_validate_waypoints_rejects_longitude_out_of_bounds():
    with pytest.raises(HTTPException) as exc_info:
        validate_waypoints([Waypoint(lat=48.85, lon=50.0), Waypoint(lat=48.85, lon=2.35)])
    assert exc_info.value.status_code == 400


def test_validate_waypoints_rejects_too_many_points():
    points = [Waypoint(lat=48.85, lon=2.35) for _ in range(settings.max_waypoints + 1)]
    with pytest.raises(HTTPException) as exc_info:
        validate_waypoints(points)
    assert exc_info.value.status_code == 400


def test_validate_avoid_zones_accepts_zone_within_france():
    validate_avoid_zones([AvoidZone(lat=48.85, lon=2.35, radius_m=500)])


def test_validate_avoid_zones_rejects_too_many_zones():
    # Régression : aucun plafond n'existait, contrairement à max_waypoints —
    # chaque zone ajoute un polygone à 24 sommets au custom_model envoyé à
    # GraphHopper à chaque recalcul, sans limite ni côté client ni serveur.
    zones = [AvoidZone(lat=48.85, lon=2.35, radius_m=500) for _ in range(settings.max_avoid_zones + 1)]
    with pytest.raises(HTTPException) as exc_info:
        validate_avoid_zones(zones)
    assert exc_info.value.status_code == 400
