import pytest

from app.core.config import settings
from app.schemas.route import Waypoint, WaypointOut
from app.services.errors import InvalidInputError
from app.services.via_points import insert_via_points
from app.services.waypoint_validation import validate_via_points


def _wp(lat, lon):
    return WaypointOut(lat=lat, lon=lon)


def test_insert_via_point_lands_on_the_cheapest_segment():
    # Circuit carré parcouru dans le sens horaire ; le point de passage est
    # juste à l'extérieur du côté sud (entre le dernier point et le retour au
    # départ), pas du côté nord.
    circuit = [_wp(48.80, 2.30), _wp(48.90, 2.30), _wp(48.90, 2.40), _wp(48.80, 2.40), _wp(48.80, 2.30)]
    result = insert_via_points(circuit, [Waypoint(lat=48.79, lon=2.35)])

    assert len(result) == len(circuit) + 1
    assert (result[4].lat, result[4].lon) == (48.79, 2.35)


def test_insert_via_points_keeps_generated_waypoints_and_their_order():
    circuit = [_wp(48.80, 2.30), _wp(48.90, 2.30), _wp(48.90, 2.40), _wp(48.80, 2.30)]
    result = insert_via_points(circuit, [Waypoint(lat=48.95, lon=2.35), Waypoint(lat=48.75, lon=2.32)])

    kept = [(w.lat, w.lon) for w in result if (w.lat, w.lon) in {(w2.lat, w2.lon) for w2 in circuit}]
    assert kept == [(w.lat, w.lon) for w in circuit]


def test_each_via_point_accounts_for_the_previous_ones():
    # Deux points de passage voisins du même segment : sans réévaluation après
    # chaque insertion, le second se plaçait à la même position que le premier
    # et le circuit repassait deux fois au même endroit au lieu de les
    # enchaîner.
    circuit = [_wp(48.80, 2.30), _wp(48.90, 2.30), _wp(48.90, 2.40), _wp(48.80, 2.30)]
    result = insert_via_points(circuit, [Waypoint(lat=48.85, lon=2.29), Waypoint(lat=48.87, lon=2.29)])

    positions = [i for i, w in enumerate(result) if w.lon == 2.29]
    assert len(positions) == 2
    assert positions[0] != positions[1]


def test_insert_via_points_keeps_labels():
    circuit = [_wp(48.80, 2.30), _wp(48.90, 2.30), _wp(48.80, 2.30)]
    result = insert_via_points(circuit, [Waypoint(lat=48.85, lon=2.31, label="Col du Truc")])

    assert [w.label for w in result if w.label] == ["Col du Truc"]


def test_insert_no_via_point_returns_the_circuit_unchanged():
    circuit = [_wp(48.80, 2.30), _wp(48.90, 2.30), _wp(48.80, 2.30)]
    assert insert_via_points(circuit, []) == circuit


def test_validate_via_points_accepts_points_within_france():
    validate_via_points([Waypoint(lat=48.85, lon=2.35), Waypoint(lat=45.75, lon=4.85)])


def test_validate_via_points_rejects_a_point_outside_france():
    with pytest.raises(InvalidInputError):
        validate_via_points([Waypoint(lat=60.0, lon=2.35)])


def test_validate_via_points_rejects_too_many_points():
    points = [Waypoint(lat=48.85, lon=2.35) for _ in range(settings.max_round_trip_via_points + 1)]
    with pytest.raises(InvalidInputError):
        validate_via_points(points)
