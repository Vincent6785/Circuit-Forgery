import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.schemas.route import ChargingStopOut, ComputeRouteResponse, EvSettings, Waypoint
from app.services.charging_plan import PlannedStop, plan_charging_stops, validate_ev
from app.services.graphhopper_client import graphhopper_client
from app.services.irve_client import IrveUnavailableError
from app.services.route_enrichment import path_to_response

logger = logging.getLogger(__name__)


def _max_gap_m(stop_distances: list[float], total_distance_m: float) -> Optional[float]:
    """Plus grand tronçon parcouru sans recharge : entre le départ et la
    première borne, entre deux bornes, puis jusqu'à l'arrivée."""
    if total_distance_m <= 0:
        return None
    marks = [0.0, *stop_distances, total_distance_m]
    return max(after - before for before, after in zip(marks, marks[1:]))


def _interleave(
    waypoints: list[Waypoint],
    waypoint_distances: list[float],
    stops: list[PlannedStop],
) -> tuple[list[tuple[float, float]], list[Optional[PlannedStop]]]:
    """Points à envoyer à GraphHopper pour le second calcul : les points de
    l'utilisateur, dans leur ordre, et chaque borne intercalée entre les deux
    points du trajet qui l'encadrent.

    Renvoie aussi, aligné sur cette liste, l'arrêt correspondant à chaque
    position (None pour un point de l'utilisateur) — c'est ce qui permet
    ensuite de rendre à `leg_boundaries` les seules bornes de legs qui
    décrivent les points de l'utilisateur.
    """
    points: list[tuple[float, float]] = []
    origins: list[Optional[PlannedStop]] = []
    pending = list(stops)

    for index, waypoint in enumerate(waypoints):
        # Avant de poser le point utilisateur n, on insère les arrêts dus plus
        # tôt que lui sur le tracé. Le premier point (distance 0) n'en reçoit
        # aucun : une recharge n'est jamais due au départ.
        if index > 0:
            while pending and pending[0].route_distance_m <= waypoint_distances[index]:
                stop = pending.pop(0)
                points.append((stop.station.lat, stop.station.lon))
                origins.append(stop)
        points.append((waypoint.lat, waypoint.lon))
        origins.append(None)

    # Arrêts situés au-delà du dernier point utilisateur : impossible en
    # principe (aucune recharge n'est due après l'arrivée), conservés par
    # sécurité plutôt que silencieusement perdus.
    for stop in pending:
        points.append((stop.station.lat, stop.station.lon))
        origins.append(stop)

    return points, origins


def _apply_no_stops(response: ComputeRouteResponse, unplaced: int) -> ComputeRouteResponse:
    response.charging_unplaced = unplaced
    response.charging_duration_s = 0.0
    response.charging_max_gap_m = _max_gap_m([], response.distance_m)
    return response


async def route_with_charging(
    db: Session,
    waypoints: list[Waypoint],
    base_response: ComputeRouteResponse,
    ev: EvSettings,
    **route_kwargs,
) -> ComputeRouteResponse:
    """Complète un trajet déjà calculé par ses arrêts recharge.

    Deux calculs GraphHopper sont nécessaires : le premier donne le tracé
    « à vide », le long duquel les recharges sont dues tous les
    `recharge_interval_km` ; le second passe réellement par les bornes
    retenues. Les arrêts ne deviennent pas des waypoints de l'utilisateur —
    sa liste de points reste la sienne, et `leg_boundaries` continue de ne
    décrire qu'elle.
    """
    validate_ev(ev)
    coordinates = base_response.geometry_geojson.get("coordinates", [])
    try:
        plan = await plan_charging_stops(db, coordinates, base_response.cumulative_distance_m, ev)
    except IrveUnavailableError:
        # La base des bornes est hors service : renvoyer le trajet sans arrêts
        # plutôt qu'une erreur. Le drapeau laisse le frontend le dire au lieu
        # de laisser croire qu'aucune recharge n'est nécessaire.
        logger.warning("Arrêts recharge abandonnés : base IRVE indisponible")
        base_response.charging_unavailable = True
        base_response.charging_max_gap_m = _max_gap_m([], base_response.distance_m)
        return base_response

    if not plan.stops:
        return _apply_no_stops(base_response, plan.unplaced)

    boundaries = base_response.leg_boundaries
    if len(boundaries) != len(waypoints):
        # leg_boundaries vient des snapped_waypoints renvoyés par GraphHopper,
        # un par point demandé : un décalage signalerait un changement de
        # contrat côté moteur. Sans lui, impossible de savoir entre quels
        # points de l'utilisateur intercaler chaque borne.
        logger.warning(
            "Bornes de legs inattendues (%s pour %s points) : arrêts recharge abandonnés",
            len(boundaries),
            len(waypoints),
        )
        return _apply_no_stops(base_response, plan.unplaced + len(plan.stops))

    waypoint_distances = [base_response.cumulative_distance_m[index] for index in boundaries]
    points, origins = _interleave(waypoints, waypoint_distances, plan.stops)

    path = await graphhopper_client.route(points, **route_kwargs)
    response = path_to_response(path)

    all_boundaries = response.leg_boundaries
    if len(all_boundaries) == len(origins):
        response.leg_boundaries = [
            index for index, origin in zip(all_boundaries, origins) if origin is None
        ]
        stop_indices = [index for index, origin in zip(all_boundaries, origins) if origin is not None]
    else:
        # Le tracé passe bien par les bornes, mais on ne sait plus rattacher
        # chaque borne de leg à son point : mieux vaut aucune borne de leg
        # qu'une liste décalée, qui ferait insérer les étapes au mauvais
        # endroit lors d'un glisser sur le tracé.
        logger.warning("Bornes de legs du second calcul inexploitables : leg_boundaries vidé")
        response.leg_boundaries = []
        stop_indices = []

    stops = [origin for origin in origins if origin is not None]
    stop_distances = [
        response.cumulative_distance_m[index] if index < len(response.cumulative_distance_m) else 0.0
        for index in stop_indices
    ] or [stop.route_distance_m for stop in stops]

    response.charging_stops = [
        ChargingStopOut(
            lat=stop.station.lat,
            lon=stop.station.lon,
            name=stop.station.name,
            address=stop.station.address,
            power_kw=stop.station.power_kw,
            point_count=stop.station.point_count,
            two_wheeler=stop.station.two_wheeler,
            detour_m=stop.detour_m,
            route_distance_m=distance,
            charge_percent=plan.charge_percent,
            charge_duration_s=plan.charge_duration_s,
        )
        for stop, distance in zip(stops, stop_distances)
    ]
    response.charging_duration_s = plan.charge_duration_s * len(stops)
    response.charging_unplaced = plan.unplaced
    response.charging_max_gap_m = _max_gap_m(sorted(stop_distances), response.distance_m)
    return response
