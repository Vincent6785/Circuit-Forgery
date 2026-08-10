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
