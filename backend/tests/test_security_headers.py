import pytest
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security_headers import SecurityHeadersMiddleware, build_content_security_policy, tile_origin


@pytest.mark.parametrize(
    ("tile_url", "expected"),
    [
        ("https://tile.openstreetmap.org/{z}/{x}/{y}.png", "https://tile.openstreetmap.org"),
        ("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://*.tile.openstreetmap.org"),
        ("http://tuiles.local:8080/{z}/{x}/{y}.png", "http://tuiles.local:8080"),
    ],
)
def test_tile_origin(tile_url, expected):
    assert tile_origin(tile_url) == expected


def test_content_security_policy_restricts_scripts_and_allows_tiles():
    csp = build_content_security_policy("https://tile.openstreetmap.org/{z}/{x}/{y}.png")
    directives = dict(part.split(" ", 1) for part in csp.split("; "))
    assert directives["script-src"] == "'self'"
    # Directive entière comparée : aucune autre origine d'images n'est autorisée.
    assert directives["img-src"] == "'self' data: https://tile.openstreetmap.org"
    assert directives["object-src"] == "'none'"
    assert directives["frame-ancestors"] == "'none'"
    assert "'unsafe-eval'" not in csp


def test_application_responses_carry_security_headers(client):
    resp = client.get("/api/health/live")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert resp.headers["x-frame-options"] == "DENY"
    directives = dict(part.split(" ", 1) for part in resp.headers["content-security-policy"].split("; "))
    assert directives["img-src"] == f"'self' data: {tile_origin(settings.tile_url)}"


def test_error_responses_carry_security_headers_too(client):
    resp = client.get("/api/routes/999999")
    assert resp.status_code == 404
    assert "content-security-policy" in resp.headers


def test_existing_header_set_by_route_is_not_overwritten():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware, tile_url="https://tile.example.org/{z}/{x}/{y}.png")

    @app.get("/")
    def root():
        return PlainTextResponse("ok", headers={"X-Frame-Options": "SAMEORIGIN"})

    resp = TestClient(app).get("/")
    assert resp.headers["x-frame-options"] == "SAMEORIGIN"
    assert resp.headers.get_list("x-frame-options") == ["SAMEORIGIN"]


def test_client_config_exposes_tile_settings(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json() == {"tile_url": settings.tile_url, "tile_attribution": settings.tile_attribution}
    assert "{s}" not in resp.json()["tile_url"]
