import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Route
from app.db.session import get_db
from app.schemas.route import (
    AlternativesRequest,
    AlternativesResponse,
    AvoidZone,
    ComputeRouteRequest,
    ComputeRouteResponse,
    RouteCreate,
    RouteOut,
    RoundTripRequest,
    RouteUpdate,
    Waypoint,
)
from app.services.geo_sampling import subsample
from app.services.graphhopper_client import (
    GraphHopperRouteNotFoundError,
    GraphHopperUnavailableError,
    graphhopper_client,
)
from app.services.route_enrichment import path_to_response
from app.services.waypoint_validation import validate_avoid_zones, validate_waypoints

router = APIRouter(prefix="/api/routes", tags=["routes"])


def _route_to_out(route: Route) -> RouteOut:
    return RouteOut(
        id=route.id,
        name=route.name,
        description=route.description,
        waypoints=[Waypoint(**wp) for wp in json.loads(route.waypoints_json)],
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
    if body.distance_m > settings.max_round_trip_distance_m:
        raise HTTPException(400, f"Distance de circuit trop grande (max {settings.max_round_trip_distance_m} m)")
    try:
        path = await graphhopper_client.route_round_trip(
            (body.start.lat, body.start.lon),
            body.distance_m,
            body.seed,
            speed_limit_kmh=body.speed_limit_kmh,
            no_speed_limit=body.no_speed_limit,
        )
    except GraphHopperRouteNotFoundError as exc:
        raise HTTPException(422, str(exc)) from exc
    except GraphHopperUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    raw_coordinates = path["points"]["coordinates"]
    # Laisse volontairement un emplacement libre sous settings.max_waypoints :
    # un circuit généré pile au plafond ne tolérerait plus aucune mutation
    # ultérieure (ajouter un point à la main, par exemple), qui échouerait
    # aussitôt sur ce même plafond via /compute.
    round_trip_target = max(2, settings.max_waypoints - 1)
    coordinates = subsample(raw_coordinates, round_trip_target)
    waypoints = [Waypoint(lat=lat, lon=lon) for lon, lat in coordinates]
    response = path_to_response(path, waypoints=waypoints)
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
        profile=body.profile,
        distance_m=body.distance_m,
        duration_s=body.duration_s,
        geometry_geojson=json.dumps(body.geometry_geojson),
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
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(404, "Trajet introuvable")
    return _route_to_out(route)


@router.put("/{route_id}", response_model=RouteOut)
def update_route(route_id: int, body: RouteUpdate, db: Session = Depends(get_db)):
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(404, "Trajet introuvable")
    if body.name is not None:
        route.name = body.name
    if body.description is not None:
        route.description = body.description
    if body.is_favorite is not None:
        route.is_favorite = body.is_favorite
    if body.waypoints is not None:
        validate_waypoints(body.waypoints)
        route.waypoints_json = json.dumps([wp.model_dump() for wp in body.waypoints])
        route.distance_m = body.distance_m
        route.duration_s = body.duration_s
        route.geometry_geojson = json.dumps(body.geometry_geojson)
        route.updated_at = datetime.now(timezone.utc)
    if body.avoid_zones is not None:
        validate_avoid_zones(body.avoid_zones)
        route.avoid_zones_json = json.dumps([z.model_dump() for z in body.avoid_zones]) if body.avoid_zones else None
    # no_speed_limit sert de marqueur "ce sous-groupe de champs a été fourni" :
    # les deux réglages forment une paire cohérente (cf. RouteUpdate), mise à
    # jour ensemble plutôt que de tenter de distinguer un speed_limit_kmh
    # explicitement remis à None d'un champ simplement absent de la requête.
    if body.no_speed_limit is not None:
        route.no_speed_limit = body.no_speed_limit
        route.speed_limit_kmh = body.speed_limit_kmh
    db.commit()
    db.refresh(route)
    return _route_to_out(route)


@router.delete("/{route_id}", status_code=204)
def delete_route(route_id: int, db: Session = Depends(get_db)):
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(404, "Trajet introuvable")
    db.delete(route)
    db.commit()
