import asyncio
import time

import httpx

from app.core.config import settings
from app.schemas.route import GeocodeResult

_CACHE_TTL_S = 300


class NominatimClient:
    """Client pour l'API de recherche Nominatim (OpenStreetMap), avec respect de
    leur politique d'usage : User-Agent identifiant, throttling (~1 req/s), et un
    cache mémoire court pour éviter de répéter des requêtes identiques rapprochées."""

    def __init__(self):
        self._lock = asyncio.Lock()
        self._last_request_time = 0.0
        self._cache: dict[str, tuple[float, list[GeocodeResult]]] = {}

    async def search(self, query: str, limit: int = 8) -> list[GeocodeResult]:
        key = query.strip().lower()

        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < _CACHE_TTL_S:
            return cached[1]

        async with self._lock:
            elapsed = time.monotonic() - self._last_request_time
            if elapsed < settings.nominatim_min_interval_s:
                await asyncio.sleep(settings.nominatim_min_interval_s - elapsed)

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{settings.nominatim_url}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "limit": limit,
                        "countrycodes": "fr",
                    },
                    headers={"User-Agent": settings.nominatim_user_agent},
                )
            self._last_request_time = time.monotonic()

        resp.raise_for_status()
        results = [
            GeocodeResult(label=item["display_name"], lat=float(item["lat"]), lon=float(item["lon"]))
            for item in resp.json()
        ]
        self._cache[key] = (time.monotonic(), results)
        return results


geocoding_client = NominatimClient()
