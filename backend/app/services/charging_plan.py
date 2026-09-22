import bisect
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ChargingStation
from app.schemas.route import EvSettings
from app.services.charging_stations import prefetch_cells, stations_near
from app.services.errors import InvalidInputError
from app.services.geo import haversine_m


@dataclass
class PlannedStop:
    station: ChargingStation
    # Position, le long du tracé, où la recharge devient nécessaire — pas
    # celle de la borne, qui est à `detour_m` de là.
    route_distance_m: float
    detour_m: float


@dataclass
class ChargingPlan:
    stops: list[PlannedStop]
    # Recharges prévues pour lesquelles aucune borne n'a été trouvée, même en
    # élargissant la recherche : le trajet reste calculable, mais incomplet.
    unplaced: int
    charge_percent: float
    charge_duration_s: float


def validate_ev(ev: EvSettings) -> None:
    """Un intervalle de recharge supérieur à l'autonomie décrit un trajet
    impossible : la batterie serait vide avant la borne suivante. Refusé ici
    plutôt que silencieusement plafonné, parce que c'est une erreur de saisie
    et non un cas limite à arrondir."""
    if ev.recharge_interval_km > ev.autonomy_km:
        raise InvalidInputError(
            f"Intervalle de recharge ({ev.recharge_interval_km:g} km) supérieur à l'autonomie "
            f"({ev.autonomy_km:g} km) : la batterie serait vide avant la borne suivante."
        )


def charge_percent(ev: EvSettings) -> float:
    """Pourcentage à recharger à chaque arrêt : ce qu'ont consommé les
    kilomètres parcourus depuis la recharge précédente, rapportés à
    l'autonomie totale."""
    return min(100.0, ev.recharge_interval_km / ev.autonomy_km * 100.0)


def stop_targets(
    total_distance_m: float, interval_m: float, autonomy_m: float, max_stops: int
) -> list[float]:
    """Distances, le long du tracé, où une recharge est due.

    Une recharge sert à couvrir l'intervalle suivant : celles dont il ne reste
    plus assez de route à parcourir sont inutiles — sans cette règle, un
    trajet de 124 km avec un intervalle de 20 km plaçait un arrêt à 700 m de
    l'arrivée.

    La marge tolérée ne dépasse jamais ce que la charge précédente permet
    encore de parcourir (`autonomy_m - interval_m`) : quand l'intervalle
    demandé égale l'autonomie, il n'y a aucune réserve et plus aucun arrêt
    n'est supprimé. Pour un circuit en boucle, l'arrivée est le point de
    départ, et la règle vaut telle quelle.
    """
    if interval_m <= 0 or total_distance_m <= interval_m:
        return []
    skip_tail_m = max(0.0, min(interval_m, autonomy_m - interval_m))
    targets = []
    distance = interval_m
    while distance < total_distance_m and len(targets) < max_stops:
        if total_distance_m - distance > skip_tail_m:
            targets.append(distance)
        distance += interval_m
    return targets


def point_at_distance(
    coordinates: list, cumulative_distance_m: list[float], distance_m: float
) -> tuple[float, float]:
    """Point (lat, lon) du tracé à cette distance depuis le départ, par
    interpolation linéaire entre les deux sommets qui l'encadrent."""
    index = bisect.bisect_left(cumulative_distance_m, distance_m)
    if index <= 0:
        return coordinates[0][1], coordinates[0][0]
    if index >= len(coordinates):
        last = coordinates[-1]
        return last[1], last[0]

    before, after = coordinates[index - 1], coordinates[index]
    span = cumulative_distance_m[index] - cumulative_distance_m[index - 1]
    ratio = 0.0 if span <= 0 else (distance_m - cumulative_distance_m[index - 1]) / span
    return (
        before[1] + (after[1] - before[1]) * ratio,
        before[0] + (after[0] - before[0]) * ratio,
    )


async def _station_for(
    db: Session, lat: float, lon: float, already_used: set[int]
) -> Optional[tuple[ChargingStation, float]]:
    """Borne la plus proche de ce point, en élargissant la recherche si le
    premier rayon ne donne rien (campagne, montagne).

    Une borne déjà retenue plus tôt est écartée : un tracé qui repasse près
    d'elle (boucle, aller-retour) produirait sinon deux arrêts au même
    endroit, dont le second n'apporte aucune autonomie.
    """
    radii = [settings.irve_search_radius_m]
    if settings.irve_max_detour_m > settings.irve_search_radius_m:
        radii.append(settings.irve_max_detour_m)

    for radius in radii:
        for station in await stations_near(db, lat, lon, radius):
            if station.id in already_used:
                continue
            return station, haversine_m(lat, lon, station.lat, station.lon)
    return None


async def plan_charging_stops(
    db: Session, coordinates: list, cumulative_distance_m: list[float], ev: EvSettings
) -> ChargingPlan:
    """Choisit les arrêts recharge le long d'un tracé déjà calculé.

    Les arrêts sont planifiés sur ce tracé-là, avant le détour par les bornes.
    Chaque détour rallonge le trajet réel, donc écarte légèrement les
    recharges suivantes : l'endpoint mesure l'écart effectivement obtenu sur
    le tracé final et le renvoie (`charging_max_gap_m`) plutôt que de faire
    comme si le plan initial tenait exactement.
    """
    percent = charge_percent(ev)
    plan = ChargingPlan(
        stops=[],
        unplaced=0,
        charge_percent=percent,
        charge_duration_s=percent * ev.seconds_per_percent,
    )
    if not coordinates or len(cumulative_distance_m) != len(coordinates):
        return plan

    targets = stop_targets(
        cumulative_distance_m[-1],
        ev.recharge_interval_km * 1000,
        ev.autonomy_km * 1000,
        settings.max_charging_stops,
    )
    if not targets:
        return plan

    points = [point_at_distance(coordinates, cumulative_distance_m, target) for target in targets]
    # Toutes les zones concernées sont chargées d'un coup : sélectionner les
    # bornes une par une enchaînait autant de vagues d'appels réseau qu'il y
    # avait d'arrêts.
    await prefetch_cells(db, points, settings.irve_search_radius_m)

    used: set[int] = set()
    for target, (lat, lon) in zip(targets, points):
        found = await _station_for(db, lat, lon, used)
        if found is None:
            plan.unplaced += 1
            continue
        station, detour = found
        used.add(station.id)
        plan.stops.append(PlannedStop(station=station, route_distance_m=target, detour_m=detour))
    return plan
