import httpx
import pytest
import respx

from app.core.config import settings
from app.services.geocoding_client import NominatimClient


@pytest.fixture(autouse=True)
def _fast_throttle(monkeypatch):
    # Évite d'attendre l'intervalle réel (1.1s par défaut) entre requêtes non
    # servies par le cache : sans effet sur ce que les tests vérifient.
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
