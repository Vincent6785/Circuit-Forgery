import pytest

from app.core.config import settings
from app.schemas.route import EvSettings
from app.services.charging_plan import (
    charge_percent,
    point_at_distance,
    stop_targets,
    validate_ev,
)
from app.services.errors import InvalidInputError
from app.services.irve_client import group_rows_into_stations

# --- Découpage du trajet en arrêts -----------------------------------------


def test_stop_targets_places_one_stop_per_interval():
    # L'arrêt à 80 km est écarté : il ne resterait que 20 km à parcourir,
    # couverts par la charge prise à 60 km (voir le test suivant).
    assert stop_targets(100_000, 20_000, 100_000, 50) == [20_000, 40_000, 60_000]


def test_stop_targets_skips_a_stop_too_close_to_the_arrival():
    # Régression : un trajet de 124 km avec un intervalle de 20 km plaçait un
    # arrêt à 120 km, soit 700 m avant l'arrivée, que la charge précédente
    # permettait évidemment d'atteindre.
    targets = stop_targets(124_000, 20_000, 100_000, 50)
    assert targets == [20_000, 40_000, 60_000, 80_000, 100_000]


def test_stop_targets_keeps_every_stop_when_the_interval_equals_the_autonomy():
    # Aucune réserve au-delà de l'intervalle : supprimer le dernier arrêt
    # laisserait tomber en panne avant l'arrivée.
    assert stop_targets(45_000, 20_000, 20_000, 50) == [20_000, 40_000]


def test_stop_targets_none_when_the_route_is_shorter_than_one_interval():
    assert stop_targets(15_000, 20_000, 100_000, 50) == []


def test_stop_targets_respects_the_maximum():
    assert len(stop_targets(10_000_000, 20_000, 1_000_000, 3)) == 3


def test_charge_percent_is_the_share_of_autonomy_consumed():
    assert charge_percent(EvSettings(autonomy_km=100, recharge_interval_km=20, seconds_per_percent=90)) == 20


def test_charge_percent_never_exceeds_a_full_battery():
    assert charge_percent(EvSettings(autonomy_km=50, recharge_interval_km=50, seconds_per_percent=90)) == 100


def test_validate_ev_rejects_an_interval_beyond_the_autonomy():
    with pytest.raises(InvalidInputError):
        validate_ev(EvSettings(autonomy_km=80, recharge_interval_km=120, seconds_per_percent=90))


def test_validate_ev_accepts_an_interval_equal_to_the_autonomy():
    validate_ev(EvSettings(autonomy_km=80, recharge_interval_km=80, seconds_per_percent=90))


# --- Position d'un arrêt sur le tracé --------------------------------------

COORDS = [[2.0, 48.0], [2.0, 48.1], [2.0, 48.2]]
CUMULATIVE = [0.0, 1000.0, 2000.0]


def test_point_at_distance_interpolates_between_two_vertices():
    lat, lon = point_at_distance(COORDS, CUMULATIVE, 1500.0)
    assert lat == pytest.approx(48.15)
    assert lon == pytest.approx(2.0)


def test_point_at_distance_clamps_to_the_ends():
    assert point_at_distance(COORDS, CUMULATIVE, -10) == (48.0, 2.0)
    assert point_at_distance(COORDS, CUMULATIVE, 99_999) == (48.2, 2.0)


# --- Agrégation des points de charge en stations ----------------------------


def _row(**overrides):
    row = {
        "id_station_itinerance": "FRXXXP001",
        "id_station_local": None,
        "nom_station": "Station test",
        "adresse_station": "1 rue du Test",
        "puissance_nominale": 22,
        "station_deux_roues": False,
        "consolidated_latitude": 48.85,
        "consolidated_longitude": 2.35,
    }
    row.update(overrides)
    return row


def test_points_of_the_same_station_are_merged():
    stations = group_rows_into_stations([_row(), _row(puissance_nominale=150)])
    assert len(stations) == 1
    assert stations[0].point_count == 2
    # La puissance retenue est la plus élevée des points de charge.
    assert stations[0].power_kw == 150


def test_stations_without_itinerance_id_are_not_merged_together():
    # "Non concerné" est partagé par des milliers de lignes sans rapport :
    # s'en servir comme identifiant fusionnerait des stations distinctes en
    # une seule, à l'autre bout de la France.
    rows = [
        _row(id_station_itinerance="Non concerné", consolidated_latitude=48.85, consolidated_longitude=2.35),
        _row(id_station_itinerance="Non concerné", consolidated_latitude=45.75, consolidated_longitude=4.85),
    ]
    assert len(group_rows_into_stations(rows)) == 2


def test_rows_without_usable_coordinates_are_ignored():
    rows = [_row(consolidated_latitude=None), _row(consolidated_longitude="")]
    assert group_rows_into_stations(rows) == []


def test_two_wheeler_flag_is_kept_when_any_point_declares_it():
    stations = group_rows_into_stations([_row(), _row(station_deux_roues=True)])
    assert stations[0].two_wheeler is True


def test_station_falls_back_to_a_default_name():
    assert group_rows_into_stations([_row(nom_station="  ")])[0].name == "Borne de recharge"


def test_max_charging_stops_setting_is_a_positive_bound():
    assert settings.max_charging_stops >= 1
