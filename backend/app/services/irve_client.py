import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings
from app.services.http import SharedAsyncClient

logger = logging.getLogger(__name__)

# L'API tabulaire de data.gouv plafonne page_size à 200 (vérifié : au-delà,
# elle répond "Page size exceeds allowed maximum: 200").
_PAGE_SIZE = 200
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)

# Seules les colonnes réellement exploitées sont demandées : la ligne complète
# compte une cinquantaine de champs (contacts, tarification, horaires…) dont
# aucun n'entre dans le choix d'un arrêt de recharge.
_COLUMNS = (
    "id_station_itinerance",
    "id_station_local",
    "nom_station",
    "adresse_station",
    "puissance_nominale",
    "station_deux_roues",
    "consolidated_latitude",
    "consolidated_longitude",
)

UNAVAILABLE_MESSAGE = (
    "La base nationale des bornes de recharge (data.gouv.fr) est indisponible pour le moment."
)


class IrveUnavailableError(RuntimeError):
    """data.gouv.fr injoignable, en timeout, ou réponse illisible."""


@dataclass(frozen=True)
class IrveStation:
    """Station de recharge agrégée depuis les points de charge de la source."""

    station_id: str
    name: str
    lat: float
    lon: float
    address: Optional[str]
    power_kw: Optional[float]
    point_count: int
    two_wheeler: bool


def _as_float(value: object) -> Optional[float]:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    # La source contient des lignes à coordonnées vides ou aberrantes ; un NaN
    # passerait toutes les comparaisons de bornes plus bas.
    return number if number == number else None


def _station_key(row: dict) -> Optional[str]:
    """Identifiant stable d'une station. `id_station_itinerance` vaut "Non
    concerné" hors réseau d'itinérance (valeur partagée par des milliers de
    lignes sans rapport) : on retombe alors sur l'identifiant local, puis sur
    les coordonnées, plutôt que de fusionner des stations distinctes."""
    itinerance = (row.get("id_station_itinerance") or "").strip()
    if itinerance and itinerance.lower() not in {"non concerné", "non concerne"}:
        return itinerance
    local = (row.get("id_station_local") or "").strip()
    lat = _as_float(row.get("consolidated_latitude"))
    lon = _as_float(row.get("consolidated_longitude"))
    if lat is None or lon is None:
        return None
    if local:
        return f"local:{local}@{lat:.5f},{lon:.5f}"
    return f"xy:{lat:.5f},{lon:.5f}"


def _merge(existing: IrveStation, row: dict, power: Optional[float]) -> IrveStation:
    """Deux lignes de la source = deux points de charge d'une même station :
    on cumule leur nombre et on retient la puissance la plus élevée."""
    best_power = existing.power_kw
    if power is not None and (best_power is None or power > best_power):
        best_power = power
    return IrveStation(
        station_id=existing.station_id,
        name=existing.name,
        lat=existing.lat,
        lon=existing.lon,
        address=existing.address,
        power_kw=best_power,
        point_count=existing.point_count + 1,
        two_wheeler=existing.two_wheeler or bool(row.get("station_deux_roues")),
    )


def group_rows_into_stations(rows: list[dict]) -> list[IrveStation]:
    """Agrège les points de charge d'une réponse en stations. Exposé
    séparément du client HTTP pour être testable sans réseau."""
    stations: dict[str, IrveStation] = {}
    for row in rows:
        lat = _as_float(row.get("consolidated_latitude"))
        lon = _as_float(row.get("consolidated_longitude"))
        if lat is None or lon is None:
            continue
        key = _station_key(row)
        if key is None:
            continue
        power = _as_float(row.get("puissance_nominale"))
        if key in stations:
            stations[key] = _merge(stations[key], row, power)
            continue
        name = (row.get("nom_station") or "").strip() or "Borne de recharge"
        address = (row.get("adresse_station") or "").strip() or None
        stations[key] = IrveStation(
            station_id=key,
            name=name,
            lat=lat,
            lon=lon,
            address=address,
            power_kw=power,
            point_count=1,
            two_wheeler=bool(row.get("station_deux_roues")),
        )
    return list(stations.values())


class IrveClient:
    """Lecture de la Base nationale des IRVE (data.gouv.fr) par cadre
    géographique.

    Le budget de pages (settings.irve_max_rows_per_cell) borne la latence du
    premier passage dans une zone : une cellule dense en centre-ville compte
    plusieurs milliers de points de charge, qu'il serait inutile de télécharger
    en entier pour n'en retenir que la borne la plus proche. `truncated`
    signale le cas à l'appelant plutôt que de le masquer.
    """

    def __init__(self):
        self._http = SharedAsyncClient(timeout=_TIMEOUT)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def stations_in_bbox(
        self, min_lat: float, min_lon: float, max_lat: float, max_lon: float
    ) -> tuple[list[IrveStation], bool]:
        """Stations dans ce cadre, et un drapeau "réponse tronquée"."""
        rows: list[dict] = []
        truncated = False
        max_pages = max(1, settings.irve_max_rows_per_cell // _PAGE_SIZE)

        for page in range(1, max_pages + 1):
            payload = await self._get_page(min_lat, min_lon, max_lat, max_lon, page)
            page_rows = payload.get("data")
            if not isinstance(page_rows, list):
                logger.warning("Réponse IRVE illisible (page %s)", page)
                raise IrveUnavailableError(UNAVAILABLE_MESSAGE)
            rows.extend(row for row in page_rows if isinstance(row, dict))
            total = (payload.get("meta") or {}).get("total")
            if len(page_rows) < _PAGE_SIZE:
                break
            if page == max_pages:
                truncated = isinstance(total, int) and total > len(rows)
                break

        return group_rows_into_stations(rows), truncated

    async def _get_page(
        self, min_lat: float, min_lon: float, max_lat: float, max_lon: float, page: int
    ) -> dict:
        params = {
            "consolidated_latitude__greater": min_lat,
            "consolidated_latitude__less": max_lat,
            "consolidated_longitude__greater": min_lon,
            "consolidated_longitude__less": max_lon,
            "columns": ",".join(_COLUMNS),
            "page_size": _PAGE_SIZE,
            "page": page,
        }
        try:
            resp = await self._http.client.get(
                settings.irve_api_url,
                params=params,
                headers={"User-Agent": settings.irve_user_agent},
            )
        except httpx.HTTPError as exc:
            logger.warning("data.gouv (IRVE) injoignable : %r", exc)
            raise IrveUnavailableError(UNAVAILABLE_MESSAGE) from exc

        if resp.status_code != 200:
            logger.warning("data.gouv (IRVE) a répondu %s : %s", resp.status_code, resp.text[:300])
            raise IrveUnavailableError(UNAVAILABLE_MESSAGE)
        try:
            payload = resp.json()
        except ValueError as exc:
            logger.warning("Réponse IRVE non JSON : %s", resp.text[:300])
            raise IrveUnavailableError(UNAVAILABLE_MESSAGE) from exc
        if not isinstance(payload, dict):
            raise IrveUnavailableError(UNAVAILABLE_MESSAGE)
        return payload


irve_client = IrveClient()
