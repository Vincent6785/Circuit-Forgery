from app.routers import geocode as geocode_module


def test_geocode_returns_results(client, monkeypatch):
    async def fake_search(query):
        return [{"label": "Paris, France", "lat": 48.8566, "lon": 2.3522}]

    monkeypatch.setattr(geocode_module.geocoding_client, "search", fake_search)

    resp = client.get("/api/geocode", params={"q": "Paris"})
    assert resp.status_code == 200
    assert resp.json() == [{"label": "Paris, France", "lat": 48.8566, "lon": 2.3522}]


def test_geocode_rejects_query_below_min_length(client):
    resp = client.get("/api/geocode", params={"q": "ab"})
    assert resp.status_code == 422


def test_geocode_maps_upstream_failure_to_503(client, monkeypatch):
    async def fake_search(query):
        raise RuntimeError("Nominatim injoignable")

    monkeypatch.setattr(geocode_module.geocoding_client, "search", fake_search)

    resp = client.get("/api/geocode", params={"q": "Paris"})
    assert resp.status_code == 503


def test_geocode_failure_does_not_leak_upstream_details(client, monkeypatch):
    async def fake_search(query):
        raise RuntimeError("https://nominatim.interne/search a répondu 502")

    monkeypatch.setattr(geocode_module.geocoding_client, "search", fake_search)

    resp = client.get("/api/geocode", params={"q": "Paris"})
    assert resp.status_code == 503
    assert "nominatim.interne" not in resp.json()["detail"]


def test_geocode_rejects_query_too_long(client):
    resp = client.get("/api/geocode", params={"q": "x" * 201})
    assert resp.status_code == 422


def test_geocode_maps_rate_limit_to_429(client, monkeypatch):
    from app.services.geocoding_client import GeocodingRateLimitedError

    async def fake_search(query):
        raise GeocodingRateLimitedError("Trop de recherches d'adresse")

    monkeypatch.setattr(geocode_module.geocoding_client, "search", fake_search)
    resp = client.get("/api/geocode", params={"q": "Paris"})
    assert resp.status_code == 429
    assert resp.json()["detail"] == "Trop de recherches d'adresse"
