from pydantic import Field, model_validator
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
    min_lat: float = Field(default=41.0, ge=-90, le=90)
    max_lat: float = Field(default=51.5, ge=-90, le=90)
    min_lon: float = Field(default=-5.5, ge=-180, le=180)
    max_lon: float = Field(default=9.7, ge=-180, le=180)

    # >= 2 : le reste du code (génération de circuit en boucle notamment,
    # cf. routers/routes.py) suppose toujours au moins un point de départ et
    # d'arrivée distincts.
    max_waypoints: int = Field(default=20, ge=2)
    max_gpx_upload_bytes: int = Field(default=5_000_000, gt=0)
    max_avoid_zone_radius_m: float = Field(default=20_000, gt=0)
    # Pas de plafond équivalent avant ce correctif, contrairement à
    # max_waypoints pour les waypoints : chaque zone ajoute un polygone à 24
    # sommets au custom_model envoyé à GraphHopper à chaque recalcul, sans
    # limite ni côté client ni côté serveur.
    max_avoid_zones: int = Field(default=20, ge=1)
    max_round_trip_distance_m: float = Field(default=500_000, gt=0)

    nominatim_url: str = "https://nominatim.openstreetmap.org"
    # Ces deux réglages découlent de la politique d'usage de Nominatim :
    # User-Agent identifiant obligatoire, ~1 requête/s maximum.
    nominatim_user_agent: str = "circuit-forgery/0.1 (usage local non commercial)"
    nominatim_min_interval_s: float = Field(default=1.1, ge=0)

    class Config:
        env_prefix = "CF_"

    @model_validator(mode="after")
    def _check_bounding_box(self) -> "Settings":
        # Une inversion (ex. CF_MIN_LAT > CF_MAX_LAT par faute de frappe) fait
        # rejeter silencieusement toute coordonnée comme hors de France —
        # mieux vaut échouer clairement au démarrage.
        if self.min_lat >= self.max_lat:
            raise ValueError(f"CF_MIN_LAT ({self.min_lat}) doit être strictement inférieur à CF_MAX_LAT ({self.max_lat})")
        if self.min_lon >= self.max_lon:
            raise ValueError(f"CF_MIN_LON ({self.min_lon}) doit être strictement inférieur à CF_MAX_LON ({self.max_lon})")
        return self


settings = Settings()
