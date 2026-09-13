import asyncio
import logging
import time
from collections import OrderedDict
from collections.abc import Callable

import httpx

from app.core.config import settings
from app.schemas.route import GeocodeResult
from app.services.http import SharedAsyncClient

logger = logging.getLogger(__name__)

_CACHE_TTL_S = 300
# Borne la mémoire : sans limite, chaque requête distincte restait en cache
# indéfiniment (les entrées expirées n'étaient jamais supprimées).
_CACHE_MAX_ENTRIES = 256
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class GeocodingRateLimitedError(RuntimeError):
    """Nominatim a refusé la requête pour dépassement de quota (429)."""


def _parse_results(payload: object) -> list[GeocodeResult]:
    if not isinstance(payload, list):
        raise ValueError("Réponse Nominatim inattendue")
    results = []
    for item in payload:
        try:
            results.append(GeocodeResult(label=item["display_name"], lat=float(item["lat"]), lon=float(item["lon"])))
        except (KeyError, TypeError, ValueError):
            # Un résultat incomplet est ignoré plutôt que de faire échouer toute la recherche.
            continue
    return results


class NominatimClient:
    """Client de recherche Nominatim (OpenStreetMap), conforme à leur politique
    d'usage : User-Agent identifiant, requêtes espacées d'au moins
    nominatim_min_interval_s, et cache mémoire borné de courte durée.

    Deux recherches identiques simultanées partagent une seule requête. Le
    verrou ne protège que la réservation du créneau d'envoi, pas l'appel
    HTTP : une recherche lente ne bloque plus toutes les autres."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._http = SharedAsyncClient(timeout=_TIMEOUT)
        self._next_slot = 0.0
        self._cache: OrderedDict[str, tuple[float, list[GeocodeResult]]] = OrderedDict()
        self._inflight: dict[str, asyncio.Task] = {}
        self._locks: dict[asyncio.AbstractEventLoop, asyncio.Lock] = {}

    async def aclose(self) -> None:
        await self._http.aclose()

    def clear_cache(self) -> None:
        self._cache.clear()

    async def search(self, query: str, limit: int = 8) -> list[GeocodeResult]:
        key = " ".join(query.lower().split())

        cached = self._cache_get(key)
        if cached is not None:
            return cached

        task = self._inflight.get(key)
        if task is None:
            task = asyncio.ensure_future(self._fetch_and_cache(key, query, limit))
            self._inflight[key] = task
            task.add_done_callback(lambda done, key=key: self._forget_inflight(key, done))
        # shield : l'annulation d'un appelant (client déconnecté) n'interrompt
        # pas la requête partagée avec les autres.
        return await asyncio.shield(task)

    def _forget_inflight(self, key: str, task: asyncio.Task) -> None:
        if self._inflight.get(key) is task:
            del self._inflight[key]
        # Récupère l'exception éventuelle, pour qu'une tâche dont plus aucun
        # appelant n'attend le résultat ne produise pas d'avertissement.
        if not task.cancelled():
            task.exception()

    async def _fetch_and_cache(self, key: str, query: str, limit: int) -> list[GeocodeResult]:
        await self._wait_for_slot()
        resp = await self._http.client.get(
            f"{settings.nominatim_url}/search",
            params={"q": query, "format": "json", "limit": limit, "countrycodes": "fr"},
            headers={"User-Agent": settings.nominatim_user_agent},
        )
        if resp.status_code == 429:
            logger.warning("Nominatim limite le débit (429)")
            raise GeocodingRateLimitedError("Trop de recherches d'adresse, réessayez dans quelques secondes.")
        resp.raise_for_status()
        results = _parse_results(resp.json())
        self._cache_put(key, results)
        return results

    def _lock(self) -> asyncio.Lock:
        # Un verrou par boucle d'événements : un asyncio.Lock utilisé depuis
        # une autre boucle que la sienne lève une erreur (tests, rechargement).
        loop = asyncio.get_running_loop()
        lock = self._locks.get(loop)
        if lock is None:
            lock = self._locks[loop] = asyncio.Lock()
        return lock

    async def _wait_for_slot(self) -> None:
        async with self._lock():
            now = self._clock()
            start = max(now, self._next_slot)
            self._next_slot = start + settings.nominatim_min_interval_s
        delay = start - now
        if delay > 0:
            await asyncio.sleep(delay)

    def _cache_get(self, key: str) -> list[GeocodeResult] | None:
        entry = self._cache.get(key)
        if entry is None:
            return None
        stored_at, results = entry
        if self._clock() - stored_at >= _CACHE_TTL_S:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return results

    def _cache_put(self, key: str, results: list[GeocodeResult]) -> None:
        self._cache[key] = (self._clock(), results)
        self._cache.move_to_end(key)
        while len(self._cache) > _CACHE_MAX_ENTRIES:
            self._cache.popitem(last=False)


geocoding_client = NominatimClient()
