import asyncio
import logging
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ChargingStation, IrveCacheCell
from app.services.geo import haversine_m
from app.services.irve_client import IrveStation, irve_client

logger = logging.getLogger(__name__)

_METERS_PER_DEG_LAT = 111_320.0
# Sous cette latitude cosinus, la conversion mètres → degrés de longitude
# diverge ; sans plancher, un point polaire produirait un cadre infini. Hors
# de France, mais la fonction ne doit pas exploser pour autant.
_MIN_COS_LAT = 0.01
# Appels simultanés à data.gouv.fr : assez pour qu'un trajet inconnu se
# charge en quelques secondes, assez peu pour rester courtois envers un
# service public gratuit et sans clé d'API.
_MAX_CONCURRENT_FETCHES = 6


def _deg_span(radius_m: float, lat: float) -> tuple[float, float]:
    """Demi-largeurs en degrés d'un cadre de `radius_m` autour de cette
    latitude."""
    d_lat = radius_m / _METERS_PER_DEG_LAT
    cos_lat = max(abs(math.cos(math.radians(lat))), _MIN_COS_LAT)
    return d_lat, radius_m / (_METERS_PER_DEG_LAT * cos_lat)


def cell_size_for(radius_m: float, lat: float) -> float:
    """Pas de grille utilisé pour ce rayon de recherche.

    Une grille au pas fixe obligerait à interroger des dizaines de cellules
    pour un grand rayon. En la dimensionnant sur le rayon demandé, le cadre
    de recherche ne recouvre jamais plus de 2 × 2 cellules — donc au plus
    quatre appels à data.gouv pour une zone encore inconnue, et un seul dès
    qu'une recharge suivante retombe dans les mêmes cellules.
    """
    d_lat, _ = _deg_span(radius_m, lat)
    return max(settings.irve_cache_cell_deg, 2 * d_lat)


def _cells_covering(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float, size_deg: float
) -> list[tuple[str, tuple[float, float, float, float]]]:
    """Cellules de la grille recouvrant ce cadre, avec leur propre cadre.

    La clé porte le pas de grille : deux recherches de rayons différents ne
    partagent pas leurs cellules, et une cellule fine ne peut pas se faire
    passer pour une cellule large déjà chargée.
    """
    cells = []
    lat_start = math.floor(min_lat / size_deg)
    lat_end = math.floor(max_lat / size_deg)
    lon_start = math.floor(min_lon / size_deg)
    lon_end = math.floor(max_lon / size_deg)
    for i in range(lat_start, lat_end + 1):
        for j in range(lon_start, lon_end + 1):
            bbox = (i * size_deg, j * size_deg, (i + 1) * size_deg, (j + 1) * size_deg)
            cells.append((f"{size_deg:.4f}:{i}:{j}", bbox))
    return cells


def _fresh_cell_keys(db: Session, keys: list[str]) -> set[str]:
    if not keys:
        return set()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.irve_cache_ttl_s)
    rows = db.execute(
        select(IrveCacheCell.cell_key, IrveCacheCell.fetched_at).where(IrveCacheCell.cell_key.in_(keys))
    ).all()
    fresh = set()
    for key, fetched_at in rows:
        # SQLite ne conserve pas le fuseau : un horodatage relu est naïf alors
        # qu'il a été écrit en UTC (même correctif que pour les trajets).
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        if fetched_at >= cutoff:
            fresh.add(key)
    return fresh


def _store(db: Session, cell_key: str, stations: list[IrveStation], truncated: bool) -> None:
    """Enregistre les stations d'une cellule puis marque celle-ci à jour.

    Les stations sont dédupliquées sur `station_id` : deux cellules voisines
    peuvent renvoyer la même station (cadres qui se recouvrent après
    élargissement), et une station déjà connue est rafraîchie plutôt que
    dupliquée.
    """
    if stations:
        known = {
            row[0]: row[1]
            for row in db.execute(
                select(ChargingStation.station_id, ChargingStation.id).where(
                    ChargingStation.station_id.in_([s.station_id for s in stations])
                )
            ).all()
        }
        now = datetime.now(timezone.utc)
        for station in stations:
            existing_id = known.get(station.station_id)
            values = {
                "name": station.name,
                "lat": station.lat,
                "lon": station.lon,
                "address": station.address,
                "power_kw": station.power_kw,
                "point_count": station.point_count,
                "two_wheeler": station.two_wheeler,
                "fetched_at": now,
            }
            if existing_id is None:
                db.add(ChargingStation(station_id=station.station_id, **values))
            else:
                db.merge(ChargingStation(id=existing_id, station_id=station.station_id, **values))

    cell = db.scalar(select(IrveCacheCell).where(IrveCacheCell.cell_key == cell_key))
    if cell is None:
        db.add(IrveCacheCell(cell_key=cell_key, truncated=truncated))
    else:
        cell.fetched_at = datetime.now(timezone.utc)
        cell.truncated = truncated
    db.commit()


async def _ensure_cells(
    db: Session, cells: list[tuple[str, tuple[float, float, float, float]]]
) -> None:
    """Charge les cellules manquantes ou périmées depuis data.gouv.

    Les appels partent de front (dans la limite de _MAX_CONCURRENT_FETCHES,
    par correction vis-à-vis d'un service public gratuit) : en série, un
    trajet traversant une quinzaine de cellules inconnues demandait une
    vingtaine de secondes, à chaque recalcul déclenché par un simple
    déplacement de point tant que le cache était vide. L'écriture en base
    reste séquentielle — la session SQLAlchemy n'est pas concurrente.
    """
    fresh = _fresh_cell_keys(db, [key for key, _ in cells])
    missing = [(key, bbox) for key, bbox in cells if key not in fresh]
    if not missing:
        return

    semaphore = asyncio.Semaphore(_MAX_CONCURRENT_FETCHES)

    async def fetch(bbox):
        async with semaphore:
            return await irve_client.stations_in_bbox(*bbox)

    results = await asyncio.gather(*(fetch(bbox) for _, bbox in missing))
    for (key, _), (stations, truncated) in zip(missing, results):
        if truncated:
            logger.info("Cellule IRVE %s tronquée : zone très dense, bornes lues partiellement", key)
        _store(db, key, stations, truncated)


async def prefetch_cells(db: Session, points: list[tuple[float, float]], radius_m: float) -> None:
    """Charge en une fois les cellules couvrant tous ces points.

    Les arrêts recharge d'un trajet sont connus d'avance : les charger
    ensemble évite d'enchaîner autant de vagues d'appels réseau qu'il y a
    d'arrêts, chacune attendant la précédente. Les cellules communes à
    plusieurs arrêts ne sont demandées qu'une fois.
    """
    cells: dict[str, tuple[float, float, float, float]] = {}
    for lat, lon in points:
        d_lat, d_lon = _deg_span(radius_m, lat)
        size_deg = cell_size_for(radius_m, lat)
        for key, bbox in _cells_covering(
            lat - d_lat, lon - d_lon, lat + d_lat, lon + d_lon, size_deg
        ):
            cells.setdefault(key, bbox)
    await _ensure_cells(db, list(cells.items()))


async def stations_near(db: Session, lat: float, lon: float, radius_m: float) -> list[ChargingStation]:
    """Stations de recharge à moins de `radius_m` de ce point, les plus
    proches d'abord.

    Les cellules manquantes ou périmées sont chargées depuis data.gouv au
    passage ; un échec réseau remonte en IrveUnavailableError.
    """
    d_lat, d_lon = _deg_span(radius_m, lat)
    size_deg = cell_size_for(radius_m, lat)
    cells = _cells_covering(lat - d_lat, lon - d_lon, lat + d_lat, lon + d_lon, size_deg)
    await _ensure_cells(db, cells)

    rows = db.scalars(
        select(ChargingStation).where(
            ChargingStation.lat >= lat - d_lat,
            ChargingStation.lat <= lat + d_lat,
            ChargingStation.lon >= lon - d_lon,
            ChargingStation.lon <= lon + d_lon,
        )
    ).all()
    # Le cadre est carré, le rayon ne l'est pas : le filtrage final se fait à
    # la distance réelle.
    within = [(haversine_m(lat, lon, row.lat, row.lon), row) for row in rows]
    within = [(distance, row) for distance, row in within if distance <= radius_m]
    within.sort(key=lambda item: item[0])
    return [row for _, row in within]
