from collections.abc import Sequence

from app.schemas.route import Waypoint, WaypointOut
from app.services.geo import haversine_m


def _cheapest_insertion_index(waypoints: Sequence[WaypointOut], point: Waypoint) -> int:
    """Index i tel qu'insérer `point` entre waypoints[i] et waypoints[i+1]
    minimise le détour à vol d'oiseau — heuristique « insertion la moins
    coûteuse ». Miroir de `cheapestInsertionIndex` côté frontend
    (src/utils/geo.js), où elle sert déjà à placer une étape déposée sur le
    tracé.
    """
    best_index = 0
    best_cost = float("inf")
    for i in range(len(waypoints) - 1):
        a, b = waypoints[i], waypoints[i + 1]
        cost = (
            haversine_m(a.lat, a.lon, point.lat, point.lon)
            + haversine_m(point.lat, point.lon, b.lat, b.lon)
            - haversine_m(a.lat, a.lon, b.lat, b.lon)
        )
        if cost < best_cost:
            best_cost = cost
            best_index = i
    return best_index


def insert_via_points(
    waypoints: Sequence[WaypointOut], via_points: Sequence[Waypoint]
) -> list[WaypointOut]:
    """Insère les points de passage imposés dans une séquence de waypoints
    générée.

    L'algorithme round_trip de GraphHopper n'accepte qu'un seul point (vérifié
    empiriquement : en envoyer un second échoue avec « For round trip
    calculation exactly one point is required »), les points de passage ne
    peuvent donc pas être imposés à la génération elle-même. Ils sont placés
    après coup dans le circuit obtenu, exactement comme le ferait un
    glisser-déposer sur le tracé côté carte ; le recalcul d'itinéraire
    déclenché ensuite par le frontend (POST /compute) route réellement le
    circuit à travers ces points.

    Les points sont insérés l'un après l'autre, chacun tenant compte des
    précédents : deux points de passage proches d'un même segment ne se
    disputent pas la même position.
    """
    result = list(waypoints)
    for via in via_points:
        index = _cheapest_insertion_index(result, via)
        result.insert(index + 1, WaypointOut(lat=via.lat, lon=via.lon, label=via.label))
    return result
