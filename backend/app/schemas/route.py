from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeFloat,
    StringConstraints,
    model_validator,
)

# Répété dans 4 schémas (compute, round-trip, création, mise à jour) : un
# type partagé évite qu'un futur ajustement de la plage 20-80 n'oublie l'un
# des quatre, acceptant alors silencieusement une valeur qu'un autre schéma
# rejetterait.
SpeedLimitKmh = Annotated[Optional[float], Field(default=None, ge=20, le=80)]

# Backend exposé sans authentification sur le LAN (limitation documentée,
# README) : ces bornes ne sont pas des limites métier mais un garde-fou bon
# marché contre un client qui remplirait la base avec des champs démesurés.
# 200 000 points couvrent très largement un long trajet (quelques dizaines de
# milliers de points pour plusieurs centaines de km) ; la taille du corps de
# requête est en plus bornée en amont (app/core/body_limit.py).
MAX_GEOMETRY_POINTS = 200_000
MAX_LABEL_LENGTH = 200

Label = Annotated[str, StringConstraints(max_length=MAX_LABEL_LENGTH)]
RouteName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


def _assume_utc(value: datetime) -> datetime:
    # SQLite ne conserve pas le fuseau : un horodatage relu est naïf alors
    # qu'il a été écrit en UTC. Sans fuseau dans la réponse, un navigateur
    # l'interprète comme une heure locale (1 à 2 h d'écart en France).
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_assume_utc)]


class RequestModel(BaseModel):
    """Base des schémas d'entrée : refuse NaN et ±Infinity, que le décodeur
    JSON accepte. Les comparaisons de bornes étant toutes fausses pour NaN,
    une valeur NaN passait sinon la validation (rayon de zone à éviter,
    notamment) et produisait un polygone NaN envoyé à GraphHopper."""

    model_config = ConfigDict(allow_inf_nan=False)


class Waypoint(RequestModel):
    lat: Latitude
    lon: Longitude
    label: Optional[Label] = None


class WaypointOut(BaseModel):
    """Waypoint renvoyé par l'API : sans les contraintes d'entrée, pour qu'un
    trajet enregistré avant leur ajout (libellé plus long, par exemple) reste
    lisible."""

    lat: float
    lon: float
    label: Optional[str] = None


class AvoidZone(RequestModel):
    lat: Latitude
    lon: Longitude
    radius_m: float = Field(gt=0)


class LineStringGeometry(RequestModel):
    """Géométrie GeoJSON d'un tracé : coordonnées [lon, lat] ou
    [lon, lat, altitude]. Validée pour qu'un tracé enregistré soit toujours
    exploitable, à l'export GPX notamment."""

    type: Literal["LineString"]
    coordinates: list[Annotated[list[float], Field(min_length=2, max_length=3)]] = Field(
        min_length=2, max_length=MAX_GEOMETRY_POINTS
    )


class ComputeRouteRequest(RequestModel):
    waypoints: list[Waypoint] = Field(min_length=2)
    avoid_zones: list[AvoidZone] = []
    # None = comportement par défaut du profil (80 km/h). Une valeur ne peut
    # qu'abaisser ce seuil (20 à 80) : le relever nécessite no_speed_limit,
    # cf. services/avoid_zone.py::build_custom_model pour la raison.
    speed_limit_kmh: SpeedLimitKmh
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
    waypoints: list[WaypointOut] = []
    # Passe à True côté round-trip quand le tracé brut renvoyé par GraphHopper
    # a dû être sous-échantillonné pour respecter max_waypoints — même logique
    # que GpxImportResponse.truncated côté import GPX.
    simplified: bool = False


class RoundTripRequest(RequestModel):
    start: Waypoint
    distance_m: float = Field(gt=0)
    seed: Optional[int] = None
    # Points que le circuit généré doit traverser, dans l'ordre où ils ont été
    # posés. GraphHopper ne sait pas les imposer à round_trip (un seul point
    # accepté) : ils sont insérés dans le circuit obtenu, cf.
    # services/via_points.py.
    via_points: list[Waypoint] = []
    avoid_zones: list[AvoidZone] = []
    speed_limit_kmh: SpeedLimitKmh
    no_speed_limit: bool = False


class AlternativesRequest(RequestModel):
    waypoints: list[Waypoint] = Field(min_length=2, max_length=2)
    # Un seuil personnalisé (custom_model) est incompatible avec alternative_route
    # (cf. ui/route-alternatives.js) : seul le changement de profil "Aucune limite"
    # est proposé ici, le seuil resserré reste bloqué côté frontend.
    no_speed_limit: bool = False


class AlternativesResponse(BaseModel):
    alternatives: list[ComputeRouteResponse]


class RouteCreate(RequestModel):
    name: RouteName
    description: Optional[str] = Field(default=None, max_length=2000)
    waypoints: list[Waypoint] = Field(min_length=2)
    distance_m: NonNegativeFloat
    duration_s: NonNegativeFloat
    geometry_geojson: LineStringGeometry
    avoid_zones: Optional[list[AvoidZone]] = None
    speed_limit_kmh: SpeedLimitKmh
    no_speed_limit: bool = False


# Champs décrivant le tracé calculé pour un jeu de waypoints : indissociables.
ROUTE_DATA_FIELDS = frozenset({"waypoints", "distance_m", "duration_s", "geometry_geojson"})
_NON_NULLABLE_UPDATE_FIELDS = ROUTE_DATA_FIELDS | {"name", "is_favorite", "no_speed_limit"}


class RouteUpdate(RequestModel):
    """Mise à jour partielle : seuls les champs présents dans la requête sont
    modifiés (model_fields_set). Un champ nullable explicitement mis à null
    (description, zones, seuil) est effacé ; un champ absent est conservé."""

    name: Optional[RouteName] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    is_favorite: Optional[bool] = None
    # Présent seulement en édition, pour remplacer le tracé d'un trajet déjà
    # sauvegardé. Le recalcul GraphHopper a lieu côté frontend (POST /compute)
    # avant ce PUT — comme RouteCreate, cet endpoint ne reçoit qu'un résultat
    # déjà calculé.
    waypoints: Optional[list[Waypoint]] = Field(default=None, min_length=2)
    distance_m: Optional[NonNegativeFloat] = None
    duration_s: Optional[NonNegativeFloat] = None
    geometry_geojson: Optional[LineStringGeometry] = None
    avoid_zones: Optional[list[AvoidZone]] = None
    speed_limit_kmh: SpeedLimitKmh
    no_speed_limit: Optional[bool] = None

    @model_validator(mode="after")
    def _check_partial_update(self) -> "RouteUpdate":
        provided = self.model_fields_set
        for field in sorted(_NON_NULLABLE_UPDATE_FIELDS & provided):
            if getattr(self, field) is None:
                raise ValueError(f"{field} ne peut pas être null")
        # waypoints, distance_m, duration_s et geometry_geojson décrivent un
        # même tracé : en accepter une partie seulement corromprait le trajet
        # (géométrie ne correspondant plus aux points), ou était silencieusement
        # ignoré.
        route_data = ROUTE_DATA_FIELDS & provided
        if route_data and route_data != ROUTE_DATA_FIELDS:
            raise ValueError(
                "waypoints, distance_m, duration_s et geometry_geojson doivent être fournis ensemble (tracé recalculé)"
            )
        return self


class RouteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    waypoints: list[WaypointOut]
    distance_m: float
    duration_s: float
    geometry_geojson: dict
    profile: str
    is_favorite: bool
    created_at: UtcDatetime
    updated_at: Optional[UtcDatetime] = None
    avoid_zones: list[AvoidZone] = []
    speed_limit_kmh: Optional[float] = None
    no_speed_limit: bool = False


class RouteSummaryOut(BaseModel):
    """Trajet tel qu'affiché dans la liste des trajets sauvegardés, sans
    points ni géométrie (GET /api/routes?view=summary)."""

    id: int
    name: str
    description: Optional[str] = None
    distance_m: float
    duration_s: float
    is_favorite: bool
    created_at: UtcDatetime
    updated_at: Optional[UtcDatetime] = None


class GeocodeResult(BaseModel):
    label: str
    lat: float
    lon: float


class PointOfInterestCreate(RequestModel):
    name: RouteName
    lat: Latitude
    lon: Longitude
    category: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=2000)


class PointOfInterestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    lat: float
    lon: float
    category: Optional[str] = None
    notes: Optional[str] = None
    created_at: UtcDatetime


class GpxExportRequest(RequestModel):
    """Trajet courant, sauvegardé ou non, à exporter en GPX."""

    name: Optional[RouteName] = None
    waypoints: list[Waypoint] = Field(min_length=2)
    geometry_geojson: LineStringGeometry


class GpxImportResponse(BaseModel):
    waypoints: list[WaypointOut]
    truncated: bool = False
