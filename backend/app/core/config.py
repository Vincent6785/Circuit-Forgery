from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CF_")

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
    max_waypoints: int = Field(default=100, ge=2)
    max_gpx_upload_bytes: int = Field(default=5_000_000, gt=0)
    max_avoid_zone_radius_m: float = Field(default=20_000, gt=0)
    # Pas de plafond équivalent avant ce correctif, contrairement à
    # max_waypoints pour les waypoints : chaque zone ajoute un polygone à 24
    # sommets au custom_model envoyé à GraphHopper à chaque recalcul, sans
    # limite ni côté client ni côté serveur.
    max_avoid_zones: int = Field(default=20, ge=1)
    max_round_trip_distance_m: float = Field(default=500_000, gt=0)
    # Points de passage imposés à un circuit en boucle : chacun consomme un
    # emplacement sous max_waypoints (routers/routes.py::compute_round_trip
    # réduit d'autant l'échantillonnage du circuit généré), et un circuit qui
    # en compterait des dizaines ne serait plus un circuit mais un itinéraire
    # — l'onglet Itinéraire est fait pour ça.
    max_round_trip_via_points: int = Field(default=20, ge=0)
    # Taille maximale d'un corps de requête, vérifiée avant sa lecture
    # complète (app/core/body_limit.py). 10 Mo couvrent largement la
    # géométrie d'un long trajet sauvegardé ; l'import GPX a sa propre borne,
    # max_gpx_upload_bytes.
    max_request_body_bytes: int = Field(default=10_000_000, gt=0)

    # --- Véhicule électrique / bornes de recharge (IRVE) ---
    # "Base nationale des IRVE" sur data.gouv.fr (Licence Ouverte), interrogée
    # via l'API tabulaire : filtrage par cadre géographique, donc pas besoin
    # de télécharger le fichier consolidé (plus de 150 Mo). Les stations lues
    # sont mises en cache en base, cellule par cellule.
    irve_api_url: str = (
        "https://tabular-api.data.gouv.fr/api/resources/eb76d20a-8501-400e-b336-d85724de5435/data/"
    )
    irve_user_agent: str = "circuit-forgery/0.1 (usage local non commercial)"
    # L'API plafonne page_size à 200 : ce budget borne le nombre de requêtes
    # par cellule (5 pages), donc la latence du premier passage dans une zone.
    irve_max_rows_per_cell: int = Field(default=1000, ge=200)
    # Côté de la grille de cache, en degrés (~5,5 km en latitude). Deux points
    # de recharge proches tombent dans la même cellule et partagent donc un
    # seul appel à data.gouv.
    irve_cache_cell_deg: float = Field(default=0.05, gt=0, le=1)
    # Au-delà, une cellule est réinterrogée : le parc de bornes bouge, mais
    # pas au point de justifier un appel par calcul d'itinéraire.
    irve_cache_ttl_s: int = Field(default=7 * 24 * 3600, ge=0)
    # Distance maximale acceptée entre le point du tracé où la recharge est
    # due et la borne retenue. Élargie jusqu'à irve_max_detour_m quand la
    # première recherche ne donne rien (zone rurale).
    irve_search_radius_m: float = Field(default=5_000, gt=0)
    irve_max_detour_m: float = Field(default=20_000, gt=0)
    # Garde-fou : un trajet très long avec un intervalle très court
    # demanderait sinon des centaines d'appels et autant de détours.
    max_charging_stops: int = Field(default=50, ge=1)

    nominatim_url: str = "https://nominatim.openstreetmap.org"
    # Ces deux réglages découlent de la politique d'usage de Nominatim :
    # User-Agent identifiant obligatoire, ~1 requête/s maximum.
    nominatim_user_agent: str = "circuit-forgery/0.1 (usage local non commercial)"
    nominatim_min_interval_s: float = Field(default=1.1, ge=0)

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # Fond de carte affiché par le frontend (exposé via /api/config) et
    # autorisé en conséquence par la Content-Security-Policy. Sans sous-domaine
    # {s}, déconseillé par la politique d'usage des tuiles OpenStreetMap.
    tile_url: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    tile_attribution: str = "&copy; OpenStreetMap contributors"

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
