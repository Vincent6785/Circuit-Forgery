from fastapi.testclient import TestClient

from app.main import app
from app.services.geocoding_client import geocoding_client
from app.services.graphhopper_client import graphhopper_client


def test_lifespan_closes_shared_http_clients():
    with TestClient(app):
        graphhopper_pool = graphhopper_client._http.client
        geocoding_pool = geocoding_client._http.client
    assert graphhopper_pool.is_closed
    assert geocoding_pool.is_closed
    assert graphhopper_client._http._client is None
    assert geocoding_client._http._client is None
