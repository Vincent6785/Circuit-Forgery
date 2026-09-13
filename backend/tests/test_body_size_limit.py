from fastapi import FastAPI, File, Request, UploadFile
from fastapi.testclient import TestClient

from app.core.body_limit import BodySizeLimitMiddleware
from app.core.config import settings
from app.main import app as fastapi_app


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware, default_limit=100, path_limits={"/upload": 1000})

    @app.post("/echo")
    async def echo(request: Request):
        return {"size": len(await request.body())}

    @app.post("/json")
    async def json_body(payload: dict):
        return {"keys": len(payload)}

    @app.post("/upload")
    async def upload(file: UploadFile = File(...)):
        return {"size": len(await file.read())}

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return TestClient(app)


def test_accepts_body_within_limit():
    resp = _client().post("/echo", content=b"x" * 100)
    assert resp.status_code == 200
    assert resp.json() == {"size": 100}


def test_rejects_declared_content_length_over_limit():
    resp = _client().post("/echo", content=b"x" * 101)
    assert resp.status_code == 413
    assert "100" in resp.json()["detail"]


def test_rejects_streamed_body_over_limit_without_content_length():
    def chunks():
        yield b"x" * 60
        yield b"x" * 60

    resp = _client().post("/echo", content=chunks())
    assert resp.status_code == 413


def test_rejects_streamed_json_body_over_limit():
    def chunks():
        yield b'{"a": "' + b"x" * 200 + b'"}'

    resp = _client().post("/json", content=chunks(), headers={"Content-Type": "application/json"})
    assert resp.status_code == 413


def test_path_specific_limit_applies_to_multipart_upload():
    client = _client()
    small = client.post("/upload", files={"file": ("a.gpx", b"x" * 500, "application/gpx+xml")})
    assert small.status_code == 200
    large = client.post("/upload", files={"file": ("a.gpx", b"x" * 2000, "application/gpx+xml")})
    assert large.status_code == 413


def test_requests_without_body_are_unaffected():
    assert _client().get("/ping").status_code == 200


def test_application_registers_the_middleware_with_configured_limits():
    middleware = next(m for m in fastapi_app.user_middleware if m.cls is BodySizeLimitMiddleware)
    assert middleware.kwargs["default_limit"] == settings.max_request_body_bytes
    assert middleware.kwargs["path_limits"]["/api/gpx/import"] > settings.max_gpx_upload_bytes
