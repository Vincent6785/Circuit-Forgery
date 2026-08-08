from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    graphhopper_url: str = "http://graphhopper:8989"
    graphhopper_profile: str = "moto_no_fast"
    database_path: str = "/data/circuit-forgery.db"

    # Bornes approximatives France métropolitaine + Corse, pour rejeter les
    # requêtes de coordonnées aberrantes avant d'interroger GraphHopper.
    min_lat: float = 41.0
    max_lat: float = 51.5
    min_lon: float = -5.5
    max_lon: float = 9.7

    max_waypoints: int = 20
    max_gpx_upload_bytes: int = 5_000_000
    max_avoid_zone_radius_m: float = 20_000
    max_round_trip_distance_m: float = 500_000

    nominatim_url: str = "https://nominatim.openstreetmap.org"
    # Politique d'usage Nominatim : User-Agent identifiant obligatoire, max ~1 req/s.
    nominatim_user_agent: str = "circuit-forgery/0.1 (usage local non commercial)"
    nominatim_min_interval_s: float = 1.1

    class Config:
        env_prefix = "CF_"


settings = Settings()
