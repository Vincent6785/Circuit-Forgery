import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_rejects_inverted_latitude_bounds():
    with pytest.raises(ValidationError):
        Settings(min_lat=50.0, max_lat=40.0)


def test_settings_rejects_inverted_longitude_bounds():
    with pytest.raises(ValidationError):
        Settings(min_lon=5.0, max_lon=-5.0)


def test_settings_rejects_zero_gpx_upload_limit():
    with pytest.raises(ValidationError):
        Settings(max_gpx_upload_bytes=0)


def test_settings_rejects_max_waypoints_below_two():
    with pytest.raises(ValidationError):
        Settings(max_waypoints=1)


def test_settings_accepts_defaults():
    Settings()  # ne doit pas lever
