from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.config import settings


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


class ComputeRouteResponse(BaseModel):
    distance_m: float
    duration_s: float
    geometry_geojson: dict
    max_speed_by_segment: list[Optional[float]] = []
    road_class_by_segment: list[Optional[str]] = []
    leg_boundaries: list[int] = []
    cumulative_distance_m: list[float] = []
    # Rempli uniquement par l'endpoint round-trip (les waypoints y sont générés
    # côté serveur) ; vide pour un calcul normal où le frontend connaît déjà
    # les waypoints qu'il a envoyés.
    waypoints: list[Waypoint] = []
    # True uniquement par l'endpoint round-trip quand le tracé généré par
    # GraphHopper a dû être sous-échantillonné pour tenir sous max_waypoints
    # (même principe que GpxImportResponse.truncated pour l'import GPX).
    simplified: bool = False


class RoundTripRequest(BaseModel):
    start: Waypoint
    distance_m: float = Field(gt=0)
    seed: Optional[int] = None


class AlternativesRequest(BaseModel):
    waypoints: list[Waypoint] = Field(min_length=2, max_length=2)


class AlternativesResponse(BaseModel):
    alternatives: list[ComputeRouteResponse]


class RouteCreate(BaseModel):
    name: str
    description: Optional[str] = None
    waypoints: list[Waypoint] = Field(min_length=2)
    distance_m: float
    duration_s: float
    geometry_geojson: dict
    # Métadonnée informative uniquement : compute_route utilise toujours
    # settings.graphhopper_profile, il n'y a pas de sélection de profil côté UI.
    profile: str = settings.graphhopper_profile
    avoid_zones: Optional[list[AvoidZone]] = None


class RouteUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_favorite: Optional[bool] = None
    # Mode édition : remplace le tracé d'un trajet déjà sauvegardé. Le recalcul
    # GraphHopper est fait côté frontend (POST /compute) avant ce PUT, comme pour
    # RouteCreate qui reçoit déjà un résultat précalculé.
    waypoints: Optional[list[Waypoint]] = None
    distance_m: Optional[float] = None
    duration_s: Optional[float] = None
    geometry_geojson: Optional[dict] = None
    avoid_zones: Optional[list[AvoidZone]] = None

    @field_validator("waypoints")
    @classmethod
    def _min_two_waypoints(cls, v: Optional[list[Waypoint]]) -> Optional[list[Waypoint]]:
        if v is not None and len(v) < 2:
            raise ValueError("Un trajet doit contenir au moins 2 points")
        return v


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

    class Config:
        from_attributes = True


class GeocodeResult(BaseModel):
    label: str
    lat: float
    lon: float


class PointOfInterestCreate(BaseModel):
    name: str
    lat: float
    lon: float
    category: Optional[str] = None
    notes: Optional[str] = None


class PointOfInterestOut(PointOfInterestCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class GpxImportResponse(BaseModel):
    waypoints: list[Waypoint]
    truncated: bool = False
