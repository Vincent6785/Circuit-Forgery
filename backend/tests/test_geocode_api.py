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
