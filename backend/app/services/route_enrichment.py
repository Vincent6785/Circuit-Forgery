from typing import Optional

from app.schemas.route import ComputeRouteResponse, WaypointOut

from app.services.geo import haversine_m  # noqa: E402


def _expand_detail(detail: list, num_points: int) -> list[Optional[object]]:
    """Déplie un path_detail GraphHopper ([from_idx, to_idx, value], ...) en
    une valeur par point du tracé, directement exploitable côté frontend."""
    values: list[Optional[object]] = [None] * num_points
    for from_idx, to_idx, value in detail:
        for i in range(from_idx, min(to_idx, num_points - 1) + 1):
            values[i] = value
    return values


def _sq_dist(a: list, b: list) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def _leg_boundaries(coordinates: list, snapped_waypoints: list) -> list[int]:
    """Retrouve, dans `coordinates`, l'index de chaque waypoint demandé, dans
    l'ordre.

    `snapped_waypoints` donne les coordonnées de chaque waypoint une fois
    accrochées au réseau routier ; vérifié empiriquement contre l'instance
    GraphHopper réelle qu'elles réapparaissent telles quelles dans
    `points.coordinates`. Le curseur de recherche n'avance que vers l'avant,
    pour rester correct même sur un trajet qui repasse près d'un point déjà
    visité (boucle, aller-retour).
    """
    if not coordinates:
        return []
    boundaries: list[int] = []
    cursor = 0
    for wp in snapped_waypoints:
        idx = min(range(cursor, len(coordinates)), key=lambda i: _sq_dist(coordinates[i], wp))
        boundaries.append(idx)
        cursor = idx
    return boundaries


def _haversine_m(a: list, b: list) -> float:
    # [lon, lat] ou [lon, lat, altitude] : l'altitude éventuelle est ignorée.
    return haversine_m(a[1], a[0], b[1], b[0])


def _cumulative_distance_m(coordinates: list) -> list[float]:
    cumulative = [0.0] * len(coordinates)
    for i in range(1, len(coordinates)):
        cumulative[i] = cumulative[i - 1] + _haversine_m(coordinates[i - 1], coordinates[i])
    return cumulative


def path_to_response(
    path: dict,
    waypoints: Optional[list[WaypointOut]] = None,
    leg_boundaries: Optional[list[int]] = None,
) -> ComputeRouteResponse:
    """leg_boundaries, s'il est fourni, remplace le calcul depuis
    snapped_waypoints : c'est le cas du circuit en boucle, dont les waypoints
    renvoyés sont extraits du tracé lui-même et non ceux demandés à
    GraphHopper (un seul point de départ)."""
    coordinates = path["points"]["coordinates"]
    num_points = len(coordinates)
    details = path.get("details", {})

    max_speed = _expand_detail(details.get("max_speed", []), num_points)
    road_class = _expand_detail(details.get("road_class", []), num_points)

    if leg_boundaries is None:
        snapped = path.get("snapped_waypoints", {}).get("coordinates", [])
        leg_boundaries = _leg_boundaries(coordinates, snapped) if snapped else []

    return ComputeRouteResponse(
        distance_m=path["distance"],
        duration_s=path["time"] / 1000,
        geometry_geojson=path["points"],
        max_speed_by_segment=max_speed,
        road_class_by_segment=road_class,
        leg_boundaries=leg_boundaries,
        cumulative_distance_m=_cumulative_distance_m(coordinates),
        waypoints=waypoints or [],
    )
