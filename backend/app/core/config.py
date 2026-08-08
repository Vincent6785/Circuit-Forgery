from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    graphhopper_url: str = "http://graphhopper:8989"
    graphhopper_profile: str = "moto_no_fast"
    # Profil sans exclusion de vitesse (graphhopper/custom_models/moto_no_limit.json),
    # utilisé quand l'utilisateur désactive la limite depuis l'UI — un seuil ne peut
    # pas être retiré par requête, cf. services/avoid_zone.py::build_custom_model.
    graphhopper_no_limit_profile: str = "moto_no_limit"
    database_path: str = "/data/circuit-forgery.db"

    # Cadre approximatif de la France métropolitaine et de la Corse : sert à
    # écarter une coordonnée aberrante avant même d'appeler GraphHopper.
    min_lat: float = 41.0
    max_lat: float = 51.5
    min_lon: float = -5.5
    max_lon: float = 9.7

    max_waypoints: int = 20
    max_gpx_upload_bytes: int = 5_000_000
    max_avoid_zone_radius_m: float = 20_000
    max_round_trip_distance_m: float = 500_000

    nominatim_url: str = "https://nominatim.openstreetmap.org"
    # Ces deux réglages découlent de la politique d'usage de Nominatim :
    # User-Agent identifiant obligatoire, ~1 requête/s maximum.
    nominatim_user_agent: str = "circuit-forgery/0.1 (usage local non commercial)"
    nominatim_min_interval_s: float = 1.1

    class Config:
        env_prefix = "CF_"


settings = Settings()
