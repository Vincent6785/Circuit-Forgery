from typing import Optional

import httpx

from app.core.config import settings
from app.schemas.route import AvoidZone
from app.services.avoid_zone import build_custom_model


class GraphHopperUnavailableError(RuntimeError):
    """Panne côté GraphHopper : injoignable, timeout, ou statut 5xx."""


class GraphHopperRouteNotFoundError(RuntimeError):
    """GraphHopper a bien répondu mais n'a pas pu calculer d'itinéraire — cause
    côté entrée utilisateur : point hors réseau routier, aucune connexion
    possible en évitant les axes rapides, etc."""


_FRIENDLY_MESSAGES = {
    "com.graphhopper.util.exceptions.PointNotFoundException": (
        "Un des points choisis est trop loin de toute route connue. "
        "Cliquez plus près d'une route."
    ),
    "com.graphhopper.util.exceptions.ConnectionNotFoundException": (
        "Aucun itinéraire trouvé entre ces points en évitant les axes rapides."
    ),
}


def _friendly_message(data: dict) -> str:
    hints = data.get("hints") or []
    details = hints[0].get("details") if hints else None
    if details in _FRIENDLY_MESSAGES:
        return _FRIENDLY_MESSAGES[details]
    return data.get("message") or "GraphHopper n'a pas pu calculer cet itinéraire."


def _extract_paths(resp: httpx.Response) -> list[dict]:
    # Un 400 GraphHopper signale un point sans route à proximité ou l'absence
    # de connexion entre deux points — une erreur d'entrée utilisateur, pas
    # une panne : GraphHopper a bien répondu.
    if resp.status_code == 400:
        raise GraphHopperRouteNotFoundError(_friendly_message(resp.json()))
    if resp.status_code != 200:
        raise GraphHopperUnavailableError(f"GraphHopper a retourné {resp.status_code}: {resp.text}")
    data = resp.json()
    if not data.get("paths"):
        raise GraphHopperRouteNotFoundError("Aucun itinéraire trouvé pour ces points")
    return data["paths"]


class GraphHopperClient:
    def __init__(self, base_url: str = settings.graphhopper_url):
        self._base_url = base_url.rstrip("/")

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                # Pas de /health dédié exposé ici : une requête de routage
                # triviale entre deux points proches fait office de sonde de
                # disponibilité.
                resp = await client.get(
                    f"{self._base_url}/route",
                    params={
                        "point": ["48.8566,2.3522", "48.8600,2.3500"],
                        "profile": settings.graphhopper_profile,
                        "points_encoded": "false",
                        "ch.disable": "true",
                    },
                )
                return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def route(
        self,
        points: list[tuple[float, float]],
        profile: Optional[str] = None,
        avoid_zones: Optional[list[AvoidZone]] = None,
    ) -> dict:
        if len(points) < 2:
            raise GraphHopperRouteNotFoundError("Au moins 2 points sont requis pour calculer un itinéraire")

        profile_name = profile or settings.graphhopper_profile

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                if avoid_zones:
                    # Une zone à éviter nécessite un corps JSON (custom_model) :
                    # POST au lieu du GET utilisé pour le cas courant sans zone.
                    # Vérifié empiriquement que ce custom_model se fusionne côté
                    # GraphHopper avec celui du profil moto_no_fast plutôt que
                    # de le remplacer — le filtre anti-80km/h reste actif en
                    # plus de l'exclusion de zone.
                    body = {
                        "points": [[lon, lat] for lat, lon in points],
                        "profile": profile_name,
                        "points_encoded": False,
                        "ch.disable": True,
                        "details": ["max_speed", "road_class"],
                        "locale": "fr",
                        "custom_model": build_custom_model(avoid_zones),
                    }
                    resp = await client.post(f"{self._base_url}/route", json=body)
                else:
                    params = {
                        "point": [f"{lat},{lon}" for lat, lon in points],
                        "profile": profile_name,
                        "points_encoded": "false",
                        # moto_no_fast n'a pas de préparation CH — figée à
                        # l'import pour un custom_model — donc CH doit être
                        # désactivé pour que GraphHopper retombe sur sa
                        # préparation LM.
                        "ch.disable": "true",
                        "details": ["max_speed", "road_class"],
                        "locale": "fr",
                    }
                    resp = await client.get(f"{self._base_url}/route", params=params)
            except httpx.HTTPError as exc:
                raise GraphHopperUnavailableError(f"GraphHopper injoignable: {exc}") from exc

        return _extract_paths(resp)[0]

    async def route_round_trip(
        self,
        start: tuple[float, float],
        distance_m: float,
        seed: Optional[int] = None,
        profile: Optional[str] = None,
    ) -> dict:
        lat, lon = start
        params = {
            "point": f"{lat},{lon}",
            "profile": profile or settings.graphhopper_profile,
            "points_encoded": "false",
            "ch.disable": "true",
            "algorithm": "round_trip",
            "round_trip.distance": distance_m,
            "details": ["max_speed", "road_class"],
            "locale": "fr",
        }
        if seed is not None:
            params["round_trip.seed"] = seed

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(f"{self._base_url}/route", params=params)
            except httpx.HTTPError as exc:
                raise GraphHopperUnavailableError(f"GraphHopper injoignable: {exc}") from exc

        return _extract_paths(resp)[0]

    async def route_alternatives(
        self,
        points: list[tuple[float, float]],
        profile: Optional[str] = None,
    ) -> list[dict]:
        params = {
            "point": [f"{lat},{lon}" for lat, lon in points],
            "profile": profile or settings.graphhopper_profile,
            "points_encoded": "false",
            "ch.disable": "true",
            "algorithm": "alternative_route",
            "details": ["max_speed", "road_class"],
            "locale": "fr",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.get(f"{self._base_url}/route", params=params)
            except httpx.HTTPError as exc:
                raise GraphHopperUnavailableError(f"GraphHopper injoignable: {exc}") from exc

        return _extract_paths(resp)


graphhopper_client = GraphHopperClient()
