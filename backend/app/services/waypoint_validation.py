from fastapi import HTTPException

from app.core.config import settings
from app.schemas.route import AvoidZone, Waypoint


def validate_waypoints(waypoints: list[Waypoint]) -> None:
    if len(waypoints) > settings.max_waypoints:
        raise HTTPException(400, f"Trop de waypoints (max {settings.max_waypoints})")
    for wp in waypoints:
        if not (settings.min_lat <= wp.lat <= settings.max_lat):
            raise HTTPException(400, f"Latitude hors de France métropolitaine: {wp.lat}")
        if not (settings.min_lon <= wp.lon <= settings.max_lon):
            raise HTTPException(400, f"Longitude hors de France métropolitaine: {wp.lon}")


def validate_avoid_zones(avoid_zones: list[AvoidZone]) -> None:
    if len(avoid_zones) > settings.max_avoid_zones:
        raise HTTPException(400, f"Trop de zones à éviter (max {settings.max_avoid_zones})")
    for zone in avoid_zones:
        if not (settings.min_lat <= zone.lat <= settings.max_lat):
            raise HTTPException(400, f"Latitude hors de France métropolitaine: {zone.lat}")
        if not (settings.min_lon <= zone.lon <= settings.max_lon):
            raise HTTPException(400, f"Longitude hors de France métropolitaine: {zone.lon}")
        if zone.radius_m <= 0 or zone.radius_m > settings.max_avoid_zone_radius_m:
            raise HTTPException(
                400, f"Rayon de zone à éviter invalide (max {settings.max_avoid_zone_radius_m} m): {zone.radius_m}"
            )
