import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import settings

# Backend exposé sans authentification sur le LAN (limitation documentée,
# README) : ces bornes ne sont pas des limites métier mais un garde-fou bon
# marché contre un client qui remplirait la base avec des champs de
# plusieurs centaines de Mo. 5 Mo pour une géométrie est très large : même
# un tracé long (plusieurs centaines de km) tient sur quelques centaines de
# Ko une fois sérialisé.
_MAX_GEOMETRY_BYTES = 5_000_000


def _validate_geometry_size(v: dict) -> dict:
    if len(json.dumps(v)) > _MAX_GEOMETRY_BYTES:
        raise ValueError(f"geometry_geojson dépasse la taille maximale autorisée ({_MAX_GEOMETRY_BYTES} octets)")
    return v


class Waypoint(BaseModel):
    lat: float
    lon: float
    label: Optional[str] = None


class AvoidZone(BaseModel):
    lat: float
    lon: float
    radius_m: float


class ComputeRouteRequest(BaseModel):
    waypoints: list[Waypoint] = Field(min_length=2)
    avoid_zones: list[AvoidZone] = []
    # None = comportement par défaut du profil (80 km/h). Une valeur ne peut
    # qu'abaisser ce seuil (20 à 80) : le relever nécessite no_speed_limit,
    # cf. services/avoid_zone.py::build_custom_model pour la raison.
    speed_limit_kmh: Optional[float] = Field(default=None, ge=20, le=80)
    no_speed_limit: bool = False


class ComputeRouteResponse(BaseModel):
    distance_m: float
    duration_s: float
    geometry_geojson: dict
    max_speed_by_segment: list[Optional[float]] = []
    road_class_by_segment: list[Optional[str]] = []
    leg_boundaries: list[int] = []
    cumulative_distance_m: list[float] = []
    # Seul l'endpoint round-trip renseigne ce champ, puisque c'est lui qui
    # génère les waypoints côté serveur ; un calcul classique le laisse vide,
    # le frontend connaissant déjà les points qu'il a envoyés.
    waypoints: list[Waypoint] = []
    # Passe à True côté round-trip quand le tracé brut renvoyé par GraphHopper
    # a dû être sous-échantillonné pour respecter max_waypoints — même logique
    # que GpxImportResponse.truncated côté import GPX.
    simplified: bool = False


class RoundTripRequest(BaseModel):
    start: Waypoint
    distance_m: float = Field(gt=0)
    seed: Optional[int] = None
    speed_limit_kmh: Optional[float] = Field(default=None, ge=20, le=80)
    no_speed_limit: bool = False


class AlternativesRequest(BaseModel):
    waypoints: list[Waypoint] = Field(min_length=2, max_length=2)
    # Un seuil personnalisé (custom_model) est incompatible avec alternative_route
    # (cf. ui/route-alternatives.js) : seul le changement de profil "Aucune limite"
    # est proposé ici, le seuil resserré reste bloqué côté frontend.
    no_speed_limit: bool = False


class AlternativesResponse(BaseModel):
    alternatives: list[ComputeRouteResponse]


class RouteCreate(BaseModel):
    name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    waypoints: list[Waypoint] = Field(min_length=2)
    distance_m: float
    duration_s: float
    geometry_geojson: dict
    # Purement informatif : il n'existe aucun sélecteur de profil côté UI,
    # compute_route s'appuie toujours sur settings.graphhopper_profile.
    profile: str = settings.graphhopper_profile
    avoid_zones: Optional[list[AvoidZone]] = None
    speed_limit_kmh: Optional[float] = Field(default=None, ge=20, le=80)
    no_speed_limit: bool = False

    @field_validator("geometry_geojson")
    @classmethod
    def _geometry_size(cls, v: dict) -> dict:
        return _validate_geometry_size(v)


class RouteUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    is_favorite: Optional[bool] = None
    # Présent seulement en édition, pour remplacer le tracé d'un trajet déjà
    # sauvegardé. Le recalcul GraphHopper a lieu côté frontend (POST /compute)
    # avant ce PUT — comme RouteCreate, cet endpoint ne reçoit qu'un résultat
    # déjà calculé.
    waypoints: Optional[list[Waypoint]] = None
    distance_m: Optional[float] = None
    duration_s: Optional[float] = None
    geometry_geojson: Optional[dict] = None
    avoid_zones: Optional[list[AvoidZone]] = None
    speed_limit_kmh: Optional[float] = Field(default=None, ge=20, le=80)
    no_speed_limit: Optional[bool] = None

    @field_validator("waypoints")
    @classmethod
    def _min_two_waypoints(cls, v: Optional[list[Waypoint]]) -> Optional[list[Waypoint]]:
        if v is not None and len(v) < 2:
            raise ValueError("Un trajet doit contenir au moins 2 points")
        return v

    @field_validator("geometry_geojson")
    @classmethod
    def _geometry_size(cls, v: Optional[dict]) -> Optional[dict]:
        return v if v is None else _validate_geometry_size(v)

    @model_validator(mode="after")
    def _waypoints_require_matching_route_data(self) -> "RouteUpdate":
        # distance_m/duration_s/geometry_geojson décrivent le tracé calculé
        # pour `waypoints` : les accepter indépendamment permettrait à un
        # nouveau jeu de waypoints d'écraser silencieusement ces champs à
        # None (ou geometry_geojson à "null"), corrompant le trajet — tout
        # GET ultérieur échoue alors (RouteOut les déclare non-optionnels).
        if self.waypoints is not None and (
            self.distance_m is None or self.duration_s is None or self.geometry_geojson is None
        ):
            raise ValueError(
                "waypoints doit être fourni avec distance_m, duration_s et geometry_geojson (tracé recalculé)"
            )
        return self


class RouteOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    waypoints: list[Waypoint]
    distance_m: float
    duration_s: float
    geometry_geojson: dict
    profile: str
    is_favorite: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    avoid_zones: list[AvoidZone] = []
    speed_limit_kmh: Optional[float] = None
    no_speed_limit: bool = False

    class Config:
        from_attributes = True


class GeocodeResult(BaseModel):
    label: str
    lat: float
    lon: float


class PointOfInterestCreate(BaseModel):
    name: str = Field(max_length=200)
    lat: float
    lon: float
    category: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=2000)


class PointOfInterestOut(PointOfInterestCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class GpxImportResponse(BaseModel):
    waypoints: list[Waypoint]
    truncated: bool = False
