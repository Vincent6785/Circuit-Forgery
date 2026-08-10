import pytest

from app.schemas.route import Waypoint
from app.services.gpx import build_gpx, parse_gpx

SAMPLE_RTE_GPX = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="48.8566" lon="2.3522"><name>A</name></rtept>
    <rtept lat="48.8738" lon="2.2950"><name>B</name></rtept>
  </rte>
  <wpt lat="1.0" lon="1.0"><name>ignored-because-rte-has-priority</name></wpt>
</gpx>
"""

WPT_ONLY_GPX = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="45.0" lon="5.0"><name>W1</name></wpt>
  <wpt lat="46.0" lon="6.0"><name>W2</name></wpt>
</gpx>
"""


def _trk_gpx(n_points: int) -> bytes:
    pts = "".join(f'<trkpt lat="{45 + i * 0.001}" lon="{5 + i * 0.001}" />' for i in range(n_points))
    return f"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>{pts}</trkseg></trk>
</gpx>""".encode()


def test_parse_gpx_prefers_rte_over_wpt():
    waypoints, truncated = parse_gpx(SAMPLE_RTE_GPX, max_waypoints=20)
    assert len(waypoints) == 2
    assert waypoints[0].lat == pytest.approx(48.8566)
    assert waypoints[0].label == "A"
    assert not truncated


def test_parse_gpx_falls_back_to_wpt():
    waypoints, truncated = parse_gpx(WPT_ONLY_GPX, max_waypoints=20)
    assert [w.label for w in waypoints] == ["W1", "W2"]
    assert not truncated


def test_parse_gpx_subsamples_large_track():
    waypoints, truncated = parse_gpx(_trk_gpx(500), max_waypoints=20)
    assert len(waypoints) <= 20
    assert truncated is True


def test_parse_gpx_small_track_not_truncated():
    waypoints, truncated = parse_gpx(_trk_gpx(5), max_waypoints=20)
    assert len(waypoints) == 5
    assert not truncated


def test_parse_gpx_invalid_xml_raises_value_error():
    with pytest.raises(ValueError):
        parse_gpx(b"not xml at all <<<", max_waypoints=20)


def test_parse_gpx_no_points_raises_value_error():
    xml = b'<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>'
    with pytest.raises(ValueError):
        parse_gpx(xml, max_waypoints=20)


def test_parse_gpx_points_missing_lat_lon_are_skipped():
    xml = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="45.0" lon="5.0"><name>ok</name></rtept>
    <rtept lon="6.0"><name>missing-lat</name></rtept>
  </rte>
</gpx>"""
    waypoints, _ = parse_gpx(xml, max_waypoints=20)
    assert len(waypoints) == 1


def test_parse_gpx_billion_laughs_is_rejected():
    xml = b"""<?xml version="1.0"?>
<!DOCTYPE gpx [
  <!ENTITY a "aaaaaaaaaa">
  <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
]>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <rtept lat="45.0" lon="5.0"><name>&b;</name></rtept>
    <rtept lat="46.0" lon="6.0"><name>b</name></rtept>
  </rte>
</gpx>"""
    with pytest.raises(ValueError):
        parse_gpx(xml, max_waypoints=20)


def test_build_gpx_contains_waypoints_and_track():
    waypoints = [Waypoint(lat=48.8566, lon=2.3522, label="A"), Waypoint(lat=48.8738, lon=2.295, label="B")]
    geometry = {"type": "LineString", "coordinates": [[2.3522, 48.8566], [2.3, 48.87], [2.295, 48.8738]]}
    xml = build_gpx("Mon trajet", waypoints, geometry)
    assert "<rtept" in xml
    assert 'lat="48.856600"' in xml
    assert "<trkpt" in xml
    assert "Mon trajet" in xml


def test_build_gpx_escapes_special_characters():
    waypoints = [Waypoint(lat=1.0, lon=1.0, label="A"), Waypoint(lat=2.0, lon=2.0, label="B")]
    xml = build_gpx('Trajet "spécial" <test> & Cie', waypoints, {"coordinates": []})
    assert "<test>" not in xml
    assert "&lt;test&gt;" in xml


def test_build_gpx_strips_illegal_xml_control_characters():
    # \x0b (VT) est illégal en XML 1.0 : rien ne l'empêche d'atteindre un nom
    # de trajet ou un label (seule la longueur est validée côté schéma) ; le
    # GPX produit doit rester valide, ré-importable par parse_gpx lui-même.
    waypoints = [Waypoint(lat=1.0, lon=1.0, label="A\x0bB"), Waypoint(lat=2.0, lon=2.0, label="C")]
    xml = build_gpx("Trajet\x0bavec contrôle", waypoints, {"coordinates": []})
    assert "\x0b" not in xml
    parsed_waypoints, _ = parse_gpx(xml.encode("utf-8"), max_waypoints=20)
    assert len(parsed_waypoints) == 2
