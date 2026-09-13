def _poi_payload(**overrides):
    payload = {"name": "Point test", "lat": 48.85, "lon": 2.35}
    payload.update(overrides)
    return payload


def test_create_poi_accepts_valid_payload(client):
    resp = client.post("/api/poi", json=_poi_payload())
    assert resp.status_code == 201


def test_create_poi_rejects_name_too_long(client):
    resp = client.post("/api/poi", json=_poi_payload(name="x" * 201))
    assert resp.status_code == 422


def test_create_poi_rejects_notes_too_long(client):
    resp = client.post("/api/poi", json=_poi_payload(notes="x" * 2001))
    assert resp.status_code == 422


def test_list_and_delete_poi(client):
    created = client.post("/api/poi", json=_poi_payload(name="À supprimer")).json()
    assert created["id"] in [p["id"] for p in client.get("/api/poi").json()]

    assert client.delete(f"/api/poi/{created['id']}").status_code == 204
    assert created["id"] not in [p["id"] for p in client.get("/api/poi").json()]


def test_delete_missing_poi_returns_404(client):
    assert client.delete("/api/poi/999999").status_code == 404


def test_create_poi_rejects_out_of_range_coordinates(client):
    assert client.post("/api/poi", json=_poi_payload(lat=91)).status_code == 422
    assert client.post("/api/poi", json=_poi_payload(lon=-181)).status_code == 422


def test_create_poi_rejects_blank_name(client):
    assert client.post("/api/poi", json=_poi_payload(name="   ")).status_code == 422


def test_poi_created_at_is_utc(client):
    created = client.post("/api/poi", json=_poi_payload()).json()
    assert created["created_at"].endswith("Z")
