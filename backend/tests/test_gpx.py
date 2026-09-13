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


def test_build_gpx_strips_xml_noncharacters():
    # U+FFFE/U+FFFF passent la validation JSON mais sont illégaux en XML 1.0 :
    # l'export produisait un GPX que l'import de l'app refusait.
    waypoints = [Waypoint(lat=1.0, lon=1.0, label="A\uffffB"), Waypoint(lat=2.0, lon=2.0, label="C\ufffe")]
    xml = build_gpx("Trajet\uffff", waypoints, {"coordinates": []})
    assert "\uffff" not in xml
    assert "\ufffe" not in xml
    parsed_waypoints, _ = parse_gpx(xml.encode("utf-8"), max_waypoints=20)
    assert [wp.label for wp in parsed_waypoints] == ["AB", "C"]


def _rte_gpx(points, ns="http://www.topografix.com/GPX/1/1") -> bytes:
    body = "".join(
        f'<rtept lat="{lat}" lon="{lon}"><name>{name}</name></rtept>' for lat, lon, name in points
    )
    return f'<?xml version="1.0"?><gpx xmlns="{ns}"><rte>{body}</rte></gpx>'.encode()


def test_parse_gpx_rejects_non_gpx_root():
    with pytest.raises(ValueError, match="gpx"):
        parse_gpx(b'<?xml version="1.0"?><kml><rte><rtept lat="45" lon="5"/></rte></kml>', max_waypoints=20)


def test_parse_gpx_falls_back_when_rte_has_no_usable_point():
    xml = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <rte><rtept><name>sans coordonnees</name></rtept></rte>
  <wpt lat="45.0" lon="5.0"><name>W1</name></wpt>
  <wpt lat="46.0" lon="6.0"><name>W2</name></wpt>
</gpx>"""
    waypoints, _ = parse_gpx(xml, max_waypoints=20)
    assert [w.label for w in waypoints] == ["W1", "W2"]


def test_parse_gpx_skips_invalid_coordinates():
    points = [("abc", "5", "texte"), ("nan", "5", "nan"), ("91", "5", "hors bornes"), ("45", "inf", "infini"),
              ("45.0", "5.0", "ok1"), ("46.0", "6.0", "ok2")]
    waypoints, _ = parse_gpx(_rte_gpx(points), max_waypoints=20)
    assert [w.label for w in waypoints] == ["ok1", "ok2"]


def test_parse_gpx_truncation_keeps_start_and_destination():
    # Régression : <rte>/<wpt> étaient tronqués en fin de liste, perdant l'arrivée.
    points = [(45 + i * 0.001, 5, f"P{i}") for i in range(50)]
    waypoints, truncated = parse_gpx(_rte_gpx(points), max_waypoints=10)
    assert truncated is True
    assert len(waypoints) <= 10
    assert waypoints[0].label == "P0"
    assert waypoints[-1].label == "P49"


def test_parse_gpx_trims_long_and_blank_labels():
    points = [(45, 5, "x" * 500), (46, 6, "   ")]
    waypoints, _ = parse_gpx(_rte_gpx(points), max_waypoints=20)
    assert len(waypoints[0].label) == 200
    assert waypoints[1].label is None


def test_parse_gpx_supports_gpx_1_0_namespace():
    points = [(45, 5, "A"), (46, 6, "B")]
    waypoints, _ = parse_gpx(_rte_gpx(points, ns="http://www.topografix.com/GPX/1/0"), max_waypoints=20)
    assert len(waypoints) == 2


def test_parse_gpx_returns_single_usable_point_for_caller_to_reject():
    waypoints, truncated = parse_gpx(_rte_gpx([(45, 5, "seul")]), max_waypoints=20)
    assert len(waypoints) == 1
    assert truncated is False


def test_build_gpx_ignores_elevation_in_track():
    waypoints = [Waypoint(lat=48.85, lon=2.35), Waypoint(lat=48.86, lon=2.36)]
    geometry = {"type": "LineString", "coordinates": [[2.35, 48.85, 35.0], [2.36, 48.86, 40.0]]}
    xml = build_gpx("Avec altitude", waypoints, geometry)
    assert '<trkpt lat="48.860000" lon="2.360000" />' in xml
