import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Route
from app.db.session import get_db
from app.schemas.route import (
    ROUTE_DATA_FIELDS,
    AlternativesRequest,
    AlternativesResponse,
    AvoidZone,
    ComputeRouteRequest,
    ComputeRouteResponse,
    RouteCreate,
    RouteOut,
    RoundTripRequest,
    RouteUpdate,
    WaypointOut,
)
from app.services.geo_sampling import subsample_indices
from app.services.graphhopper_client import (
    GraphHopperRouteNotFoundError,
    GraphHopperUnavailableError,
    graphhopper_client,
)
from app.services.route_enrichment import path_to_response
from app.services.waypoint_validation import validate_avoid_zones, validate_waypoints

router = APIRouter(prefix="/api/routes", tags=["routes"])


def _profile_for(no_speed_limit: bool) -> str:
    # Profil effectivement utilisé pour ce trajet par compute_route
    # (graphhopper_client._resolve_profile) : enregistré à titre informatif,
    # il doit refléter "Aucune limite" plutôt que toujours le profil par défaut.
    return settings.graphhopper_no_limit_profile if no_speed_limit else settings.graphhopper_profile


def _route_to_out(route: Route) -> RouteOut:
    return RouteOut(
        id=route.id,
        name=route.name,
        description=route.description,
        waypoints=[WaypointOut(**wp) for wp in json.loads(route.waypoints_json)],
        distance_m=route.distance_m,
        duration_s=route.duration_s,
        geometry_geojson=json.loads(route.geometry_geojson),
        profile=route.profile,
        is_favorite=route.is_favorite,
        created_at=route.created_at,
        updated_at=route.updated_at,
        avoid_zones=[AvoidZone(**z) for z in json.loads(route.avoid_zones_json)] if route.avoid_zones_json else [],
        speed_limit_kmh=route.speed_limit_kmh,
        no_speed_limit=route.no_speed_limit,
    )


def _get_route_or_404(db: Session, route_id: int) -> Route:
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(404, "Trajet introuvable")
    return route


@router.post("/compute", response_model=ComputeRouteResponse)
async def compute_route(body: ComputeRouteRequest):
    validate_waypoints(body.waypoints)
    validate_avoid_zones(body.avoid_zones)
    points = [(wp.lat, wp.lon) for wp in body.waypoints]
    try:
        path = await graphhopper_client.route(
            points,
            avoid_zones=body.avoid_zones or None,
            speed_limit_kmh=body.speed_limit_kmh,
            no_speed_limit=body.no_speed_limit,
        )
    except GraphHopperRouteNotFoundError as exc:
        raise HTTPException(422, str(exc)) from exc
    except GraphHopperUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    return path_to_response(path)


@router.post("/round-trip", response_model=ComputeRouteResponse)
async def compute_round_trip(body: RoundTripRequest):
    validate_waypoints([body.start])
    validate_avoid_zones(body.avoid_zones)
    if body.distance_m > settings.max_round_trip_distance_m:
        raise HTTPException(400, f"Distance de circuit trop grande (max {settings.max_round_trip_distance_m} m)")
    try:
        path = await graphhopper_client.route_round_trip(
            (body.start.lat, body.start.lon),
            body.distance_m,
            body.seed,
            avoid_zones=body.avoid_zones or None,
            speed_limit_kmh=body.speed_limit_kmh,
            no_speed_limit=body.no_speed_limit,
        )
    except GraphHopperRouteNotFoundError as exc:
        raise HTTPException(422, str(exc)) from exc
    except GraphHopperUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    raw_coordinates = path["points"]["coordinates"]
    if len(raw_coordinates) < 2:
        raise HTTPException(422, "Aucun circuit trouvé depuis ce point")
    # Laisse volontairement un emplacement libre sous settings.max_waypoints :
    # un circuit généré pile au plafond ne tolérerait plus aucune mutation
    # ultérieure (ajouter un point à la main, par exemple), qui échouerait
    # aussitôt sur ce même plafond via /compute.
    round_trip_target = max(2, settings.max_waypoints - 1)
    indices = subsample_indices(len(raw_coordinates), round_trip_target)
    # [lon, lat] ou [lon, lat, altitude] : l'altitude éventuelle est ignorée.
    waypoints = [WaypointOut(lat=raw_coordinates[i][1], lon=raw_coordinates[i][0]) for i in indices]
    # Les waypoints renvoyés sont des points du tracé lui-même : leurs indices
    # dans la géométrie sont les bornes de legs. Celles déduites de
    # snapped_waypoints ne décrivaient que le point de départ demandé, et ne
    # correspondaient donc pas aux waypoints renvoyés.
    response = path_to_response(path, waypoints=waypoints, leg_boundaries=indices)
    response.simplified = len(raw_coordinates) > round_trip_target
    return response


@router.post("/alternatives", response_model=AlternativesResponse)
async def compute_alternatives(body: AlternativesRequest):
    validate_waypoints(body.waypoints)
    points = [(wp.lat, wp.lon) for wp in body.waypoints]
    try:
        paths = await graphhopper_client.route_alternatives(points, no_speed_limit=body.no_speed_limit)
    except GraphHopperRouteNotFoundError as exc:
        raise HTTPException(422, str(exc)) from exc
    except GraphHopperUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    return AlternativesResponse(alternatives=[path_to_response(p) for p in paths])


@router.get("", response_model=list[RouteOut])
def list_routes(db: Session = Depends(get_db)):
    routes = db.query(Route).order_by(Route.created_at.desc()).all()
    return [_route_to_out(r) for r in routes]


@router.post("", response_model=RouteOut, status_code=201)
def create_route(body: RouteCreate, db: Session = Depends(get_db)):
    validate_waypoints(body.waypoints)
    if body.avoid_zones:
        validate_avoid_zones(body.avoid_zones)
    route = Route(
        name=body.name,
        description=body.description,
        waypoints_json=json.dumps([wp.model_dump() for wp in body.waypoints]),
        profile=_profile_for(body.no_speed_limit),
        distance_m=body.distance_m,
        duration_s=body.duration_s,
        geometry_geojson=json.dumps(body.geometry_geojson.model_dump()),
        avoid_zones_json=json.dumps([z.model_dump() for z in body.avoid_zones]) if body.avoid_zones else None,
        speed_limit_kmh=body.speed_limit_kmh,
        no_speed_limit=body.no_speed_limit,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return _route_to_out(route)


@router.get("/{route_id}", response_model=RouteOut)
def get_route(route_id: int, db: Session = Depends(get_db)):
    return _route_to_out(_get_route_or_404(db, route_id))


@router.put("/{route_id}", response_model=RouteOut)
def update_route(route_id: int, body: RouteUpdate, db: Session = Depends(get_db)):
    route = _get_route_or_404(db, route_id)
    provided = body.model_fields_set

    # Toutes les validations avant la moindre modification : une erreur ne
    # doit pas laisser l'objet de session à moitié mis à jour.
    if "waypoints" in provided:
        validate_waypoints(body.waypoints)
    if body.avoid_zones:
        validate_avoid_zones(body.avoid_zones)

    if "name" in provided:
        route.name = body.name
    if "description" in provided:
        route.description = body.description
    if "is_favorite" in provided:
        route.is_favorite = body.is_favorite
    if ROUTE_DATA_FIELDS <= provided:
        route.waypoints_json = json.dumps([wp.model_dump() for wp in body.waypoints])
        route.distance_m = body.distance_m
        route.duration_s = body.duration_s
        route.geometry_geojson = json.dumps(body.geometry_geojson.model_dump())
    if "avoid_zones" in provided:
        route.avoid_zones_json = json.dumps([z.model_dump() for z in body.avoid_zones]) if body.avoid_zones else None
    if "speed_limit_kmh" in provided:
        route.speed_limit_kmh = body.speed_limit_kmh
    if "no_speed_limit" in provided:
        route.no_speed_limit = body.no_speed_limit
        route.profile = _profile_for(body.no_speed_limit)

    # Basculer un favori ne modifie pas le trajet lui-même.
    if provided - {"is_favorite"}:
        route.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(route)
    return _route_to_out(route)


@router.delete("/{route_id}", status_code=204)
def delete_route(route_id: int, db: Session = Depends(get_db)):
    route = _get_route_or_404(db, route_id)
    db.delete(route)
    db.commit()
