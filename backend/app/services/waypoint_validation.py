from collections.abc import Sequence

from app.core.config import settings
from app.schemas.route import AvoidZone, Waypoint
from app.services.errors import InvalidInputError


def _check_within_france(lat: float, lon: float) -> None:
    if not (settings.min_lat <= lat <= settings.max_lat):
        raise InvalidInputError(f"Latitude hors de France métropolitaine: {lat}")
    if not (settings.min_lon <= lon <= settings.max_lon):
        raise InvalidInputError(f"Longitude hors de France métropolitaine: {lon}")


def validate_waypoints(waypoints: Sequence[Waypoint]) -> None:
    if len(waypoints) > settings.max_waypoints:
        raise InvalidInputError(f"Trop de waypoints (max {settings.max_waypoints})")
    for wp in waypoints:
        _check_within_france(wp.lat, wp.lon)


def validate_avoid_zones(avoid_zones: Sequence[AvoidZone]) -> None:
    if len(avoid_zones) > settings.max_avoid_zones:
        raise InvalidInputError(f"Trop de zones à éviter (max {settings.max_avoid_zones})")
    for zone in avoid_zones:
        _check_within_france(zone.lat, zone.lon)
        if zone.radius_m > settings.max_avoid_zone_radius_m:
            raise InvalidInputError(
                f"Rayon de zone à éviter invalide (max {settings.max_avoid_zone_radius_m} m): {zone.radius_m}"
            )
