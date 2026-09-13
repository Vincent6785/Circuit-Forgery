import logging
from typing import Optional

import httpx

from app.core.config import settings
from app.schemas.route import AvoidZone
from app.services.avoid_zone import build_custom_model
from app.services.http import SharedAsyncClient

logger = logging.getLogger(__name__)

# Connexion courte (GraphHopper est sur le réseau Docker local), lecture
# longue : un calcul avec custom_model sur un long trajet peut prendre
# plusieurs secondes.
_ROUTING_TIMEOUT = httpx.Timeout(30.0, connect=5.0)
_HEALTH_TIMEOUT = httpx.Timeout(3.0)


class GraphHopperUnavailableError(RuntimeError):
    """Panne côté GraphHopper : injoignable, timeout, statut inattendu ou
    réponse illisible."""


class GraphHopperRouteNotFoundError(RuntimeError):
    """GraphHopper a bien répondu mais n'a pas pu calculer d'itinéraire — cause
    côté entrée utilisateur : point hors réseau routier, aucune connexion
    possible en évitant les axes rapides, etc."""


# Message renvoyé au client en cas de panne : le détail (URL interne, corps
# de réponse, trace Java) n'est écrit que dans les journaux.
UNAVAILABLE_MESSAGE = "Le moteur de routage est indisponible pour le moment."
_DEFAULT_NOT_FOUND_MESSAGE = "GraphHopper n'a pas pu calculer cet itinéraire."
_MAX_UPSTREAM_MESSAGE_LENGTH = 300
_MAX_LOGGED_BODY_LENGTH = 500

_FRIENDLY_MESSAGES = {
    "com.graphhopper.util.exceptions.PointNotFoundException": (
        "Un des points choisis est trop loin de toute route connue. "
        "Cliquez plus près d'une route."
    ),
    "com.graphhopper.util.exceptions.ConnectionNotFoundException": (
        "Aucun itinéraire trouvé entre ces points en évitant les axes rapides."
    ),
}


def _friendly_message(data: object) -> str:
    if not isinstance(data, dict):
        return _DEFAULT_NOT_FOUND_MESSAGE
    hints = data.get("hints")
    first_hint = hints[0] if isinstance(hints, list) and hints else None
    details = first_hint.get("details") if isinstance(first_hint, dict) else None
    if details in _FRIENDLY_MESSAGES:
        return _FRIENDLY_MESSAGES[details]
    message = data.get("message")
    if isinstance(message, str) and message.strip():
        return message[:_MAX_UPSTREAM_MESSAGE_LENGTH]
    return _DEFAULT_NOT_FOUND_MESSAGE


def _resolve_profile(profile: Optional[str], no_speed_limit: bool) -> str:
    # "Aucune limite" bascule de profil (graphhopper_no_limit_profile n'a
    # aucune règle de vitesse) plutôt que de tenter de lever la règle du
    # profil courant par custom_model — impossible, cf. avoid_zone.py.
    if no_speed_limit:
        return settings.graphhopper_no_limit_profile
    return profile or settings.graphhopper_profile


def _tightened_speed_limit(speed_limit_kmh: Optional[float], no_speed_limit: bool) -> Optional[float]:
    # Un seuil personnalisé ne resserre que si en-dessous du défaut du
    # profil (80) ; à 80 ou au-dessus, ou avec "Aucune limite", la règle
    # serait redondante ou contradictoire.
    if no_speed_limit or speed_limit_kmh is None or speed_limit_kmh >= 80:
        return None
    return speed_limit_kmh


def _json_or_none(resp: httpx.Response) -> object:
    try:
        return resp.json()
    except ValueError:
        return None


def _unreachable(exc: httpx.HTTPError) -> GraphHopperUnavailableError:
    logger.warning("GraphHopper injoignable : %r", exc)
    return GraphHopperUnavailableError(UNAVAILABLE_MESSAGE)


def _extract_paths(resp: httpx.Response) -> list[dict]:
    # Un 400 GraphHopper signale un point sans route à proximité ou l'absence
    # de connexion entre deux points — une erreur d'entrée utilisateur, pas
    # une panne : GraphHopper a bien répondu.
    if resp.status_code == 400:
        raise GraphHopperRouteNotFoundError(_friendly_message(_json_or_none(resp)))
    if resp.status_code != 200:
        logger.warning(
            "GraphHopper a répondu %s : %s", resp.status_code, resp.text[:_MAX_LOGGED_BODY_LENGTH]
        )
        raise GraphHopperUnavailableError(UNAVAILABLE_MESSAGE)
    data = _json_or_none(resp)
    if not isinstance(data, dict):
        logger.warning("Réponse GraphHopper illisible : %s", resp.text[:_MAX_LOGGED_BODY_LENGTH])
        raise GraphHopperUnavailableError(UNAVAILABLE_MESSAGE)
    paths = data.get("paths")
    if not paths:
        raise GraphHopperRouteNotFoundError("Aucun itinéraire trouvé pour ces points")
    return paths


class GraphHopperClient:
    def __init__(self, base_url: str = settings.graphhopper_url):
        self._base_url = base_url.rstrip("/")
        self._http = SharedAsyncClient(timeout=_ROUTING_TIMEOUT)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def health(self) -> bool:
        # Endpoint de santé natif de GraphHopper : répond sans calculer
        # d'itinéraire, contrairement à l'ancienne sonde (une vraie requête
        # de routage, exécutée à chaque vérification).
        try:
            resp = await self._http.client.get(f"{self._base_url}/health", timeout=_HEALTH_TIMEOUT)
        except httpx.HTTPError as exc:
            logger.warning("Sonde de santé GraphHopper en échec : %r", exc)
            return False
        return resp.status_code == 200

    async def route(
        self,
        points: list[tuple[float, float]],
        profile: Optional[str] = None,
        avoid_zones: Optional[list[AvoidZone]] = None,
        speed_limit_kmh: Optional[float] = None,
        no_speed_limit: bool = False,
    ) -> dict:
        if len(points) < 2:
            raise GraphHopperRouteNotFoundError("Au moins 2 points sont requis pour calculer un itinéraire")

        profile_name = _resolve_profile(profile, no_speed_limit)
        tightened_speed_limit = _tightened_speed_limit(speed_limit_kmh, no_speed_limit)
        client = self._http.client

        try:
            if avoid_zones or tightened_speed_limit is not None:
                # Zones à éviter et/ou seuil resserré : nécessitent un corps
                # JSON (custom_model), donc POST plutôt que le GET utilisé
                # pour le cas courant. Vérifié empiriquement que ce
                # custom_model se fusionne côté GraphHopper avec celui du
                # profil plutôt que de le remplacer — le filtre du profil
                # reste actif en plus de ces règles supplémentaires.
                body = {
                    "points": [[lon, lat] for lat, lon in points],
                    "profile": profile_name,
                    "points_encoded": False,
                    "ch.disable": True,
                    "details": ["max_speed", "road_class"],
                    "locale": "fr",
                    "custom_model": build_custom_model(avoid_zones or [], tightened_speed_limit),
                }
                resp = await client.post(f"{self._base_url}/route", json=body)
            else:
                params = {
                    "point": [f"{lat},{lon}" for lat, lon in points],
                    "profile": profile_name,
                    "points_encoded": "false",
                    # moto_no_fast/moto_no_limit n'ont pas de préparation CH —
                    # figée à l'import pour un custom_model — donc CH doit
                    # être désactivé pour que GraphHopper retombe sur sa
                    # préparation LM.
                    "ch.disable": "true",
                    "details": ["max_speed", "road_class"],
                    "locale": "fr",
                }
                resp = await client.get(f"{self._base_url}/route", params=params)
        except httpx.HTTPError as exc:
            raise _unreachable(exc) from exc

        return _extract_paths(resp)[0]

    async def route_round_trip(
        self,
        start: tuple[float, float],
        distance_m: float,
        seed: Optional[int] = None,
        profile: Optional[str] = None,
        avoid_zones: Optional[list[AvoidZone]] = None,
        speed_limit_kmh: Optional[float] = None,
        no_speed_limit: bool = False,
    ) -> dict:
        lat, lon = start
        profile_name = _resolve_profile(profile, no_speed_limit)
        tightened_speed_limit = _tightened_speed_limit(speed_limit_kmh, no_speed_limit)

        base = {
            "profile": profile_name,
            "algorithm": "round_trip",
            "round_trip.distance": distance_m,
            "details": ["max_speed", "road_class"],
            "locale": "fr",
        }
        if seed is not None:
            base["round_trip.seed"] = seed
        client = self._http.client

        try:
            if avoid_zones or tightened_speed_limit is not None:
                # Comme route() : des zones à éviter et/ou un seuil resserré
                # nécessitent un custom_model, donc un corps JSON. Vérifié
                # empiriquement que round_trip (contrairement à
                # alternative_route) accepte bien un custom_model combiné.
                body = {
                    **base,
                    "points": [[lon, lat]],
                    "points_encoded": False,
                    "ch.disable": True,
                    "custom_model": build_custom_model(avoid_zones or [], tightened_speed_limit),
                }
                resp = await client.post(f"{self._base_url}/route", json=body)
            else:
                params = {**base, "point": f"{lat},{lon}", "points_encoded": "false", "ch.disable": "true"}
                resp = await client.get(f"{self._base_url}/route", params=params)
        except httpx.HTTPError as exc:
            raise _unreachable(exc) from exc

        return _extract_paths(resp)[0]

    async def route_alternatives(
        self,
        points: list[tuple[float, float]],
        profile: Optional[str] = None,
        no_speed_limit: bool = False,
    ) -> list[dict]:
        # Un simple changement de profil (pas de custom_model) reste compatible
        # avec alternative_route — seul un custom_model par requête ne l'est pas
        # (cf. ui/route-alternatives.js, incompatibilité vérifiée empiriquement).
        profile_name = _resolve_profile(profile, no_speed_limit)
        params = {
            "point": [f"{lat},{lon}" for lat, lon in points],
            "profile": profile_name,
            "points_encoded": "false",
            "ch.disable": "true",
            "algorithm": "alternative_route",
            "details": ["max_speed", "road_class"],
            "locale": "fr",
        }

        try:
            resp = await self._http.client.get(f"{self._base_url}/route", params=params)
        except httpx.HTTPError as exc:
            raise _unreachable(exc) from exc

        return _extract_paths(resp)


graphhopper_client = GraphHopperClient()
