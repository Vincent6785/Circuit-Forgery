import asyncio
import time

import httpx
import pytest
import respx

from app.core.config import settings
from app.services import geocoding_client as geocoding_module
from app.services.geocoding_client import GeocodingRateLimitedError, NominatimClient


@pytest.fixture(autouse=True)
def _fast_throttle(monkeypatch):
    # Court-circuite l'intervalle réel (1.1s par défaut) entre deux requêtes
    # non servies par le cache — n'a aucune incidence sur ce que ces tests
    # vérifient, seulement sur leur durée.
    monkeypatch.setattr(settings, "nominatim_min_interval_s", 0.0)


@respx.mock
async def test_search_returns_parsed_results():
    route = respx.get(f"{settings.nominatim_url}/search").mock(
        return_value=httpx.Response(
            200,
            json=[{"display_name": "Paris, France", "lat": "48.8566", "lon": "2.3522"}],
        )
    )
    client = NominatimClient()
    results = await client.search("Paris")
    assert route.called
    assert len(results) == 1
    assert results[0].label == "Paris, France"
    assert results[0].lat == pytest.approx(48.8566)


@respx.mock
async def test_search_sends_required_user_agent_header():
    route = respx.get(f"{settings.nominatim_url}/search").mock(return_value=httpx.Response(200, json=[]))
    client = NominatimClient()
    await client.search("Lyon")
    assert route.calls.last.request.headers["User-Agent"] == settings.nominatim_user_agent


@respx.mock
async def test_search_uses_cache_for_repeated_query():
    route = respx.get(f"{settings.nominatim_url}/search").mock(return_value=httpx.Response(200, json=[]))
    client = NominatimClient()
    await client.search("Marseille")
    await client.search("Marseille")
    assert route.call_count == 1


@respx.mock
async def test_search_cache_key_ignores_case_and_whitespace():
    route = respx.get(f"{settings.nominatim_url}/search").mock(return_value=httpx.Response(200, json=[]))
    client = NominatimClient()
    await client.search("Nice")
    await client.search("  NICE  ")
    assert route.call_count == 1


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


SEARCH_URL = f"{settings.nominatim_url}/search"
PARIS = [{"display_name": "Paris, France", "lat": "48.8566", "lon": "2.3522"}]


@respx.mock
async def test_cache_entries_expire_after_ttl():
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=PARIS))
    clock = FakeClock()
    client = NominatimClient(clock=clock)
    await client.search("Paris")
    clock.now += geocoding_module._CACHE_TTL_S - 1
    await client.search("Paris")
    assert route.call_count == 1
    clock.now += 2
    await client.search("Paris")
    assert route.call_count == 2


@respx.mock
async def test_cache_is_bounded_and_evicts_least_recently_used(monkeypatch):
    monkeypatch.setattr(geocoding_module, "_CACHE_MAX_ENTRIES", 2)
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=[]))
    client = NominatimClient()
    for query in ("aaa", "bbb", "ccc"):
        await client.search(query)
    assert len(client._cache) == 2
    await client.search("ccc")
    assert route.call_count == 3
    await client.search("aaa")  # évincé : nouvelle requête
    assert route.call_count == 4


@respx.mock
async def test_concurrent_identical_searches_share_one_request():
    release = asyncio.Event()

    async def slow_response(request):
        await release.wait()
        return httpx.Response(200, json=PARIS)

    route = respx.get(SEARCH_URL).mock(side_effect=slow_response)
    client = NominatimClient()
    first = asyncio.create_task(client.search("Lyon"))
    second = asyncio.create_task(client.search("  LYON "))
    await asyncio.sleep(0.05)
    release.set()
    results = await asyncio.gather(first, second)
    assert route.call_count == 1
    assert results[0] == results[1]
    assert client._inflight == {}


@respx.mock
async def test_slow_search_does_not_block_a_different_query():
    # Régression : le verrou couvrait l'appel HTTP, les recherches étaient
    # donc servies strictement une par une.
    in_flight = 0
    max_in_flight = 0
    both_started = asyncio.Event()

    async def response(request):
        nonlocal in_flight, max_in_flight
        in_flight += 1
        max_in_flight = max(max_in_flight, in_flight)
        if in_flight == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=2)
        in_flight -= 1
        return httpx.Response(200, json=[])

    respx.get(SEARCH_URL).mock(side_effect=response)
    client = NominatimClient()
    await asyncio.gather(client.search("Lille"), client.search("Brest"))
    assert max_in_flight == 2


@respx.mock
async def test_requests_are_spaced_by_min_interval(monkeypatch):
    monkeypatch.setattr(settings, "nominatim_min_interval_s", 0.2)
    sent_at = []

    def response(request):
        sent_at.append(time.monotonic())
        return httpx.Response(200, json=[])

    respx.get(SEARCH_URL).mock(side_effect=response)
    client = NominatimClient()
    await asyncio.gather(client.search("Nantes"), client.search("Rennes"))
    assert len(sent_at) == 2
    # Marge volontairement large devant l'intervalle demandé : ce qui est
    # vérifié, c'est que la seconde requête a bien attendu son créneau (sans
    # espacement, l'écart est de l'ordre de la milliseconde). Exiger 0,18 s
    # pour 0,2 s configurés ne laissait que 10 % de tolérance, et l'écart
    # mesuré est tombé à 0,179 s sur un runner CI chargé — un échec de
    # cadence de la machine, pas du code testé.
    assert sent_at[1] - sent_at[0] >= 0.1


@respx.mock
async def test_rate_limited_response_raises_dedicated_error_and_is_not_cached():
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(429))
    client = NominatimClient()
    with pytest.raises(GeocodingRateLimitedError):
        await client.search("Toulouse")
    with pytest.raises(GeocodingRateLimitedError):
        await client.search("Toulouse")
    assert route.call_count == 2


@respx.mock
async def test_malformed_results_are_skipped():
    payload = [
        {"display_name": "Sans coordonnées"},
        {"display_name": "Latitude invalide", "lat": "abc", "lon": "5"},
        {"display_name": "Valide", "lat": "45.0", "lon": "5.0"},
    ]
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
    results = await NominatimClient().search("Grenoble")
    assert [r.label for r in results] == ["Valide"]


@respx.mock
async def test_unexpected_payload_raises():
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"error": "inattendu"}))
    with pytest.raises(ValueError):
        await NominatimClient().search("Dijon")
