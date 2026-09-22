import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
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
    EvSettings,
    RouteCreate,
    RouteOut,
    RouteSummaryOut,
    RoundTripRequest,
    RouteUpdate,
    WaypointOut,
)
from app.services.charging_route import route_with_charging
from app.services.geo_sampling import subsample_indices
from app.services.graphhopper_client import graphhopper_client
from app.services.route_enrichment import path_to_response
from app.services.via_points import insert_via_points
from app.services.waypoint_validation import validate_avoid_zones, validate_via_points, validate_waypoints

# Les erreurs du domaine (règle métier, itinéraire impossible, moteur
# indisponible) sont traduites en réponses HTTP par app/core/errors.py.
router = APIRouter(prefix="/api/routes", tags=["routes"])


def _profile_for(no_speed_limit: bool) -> str:
    # Profil effectivement utilisé pour ce trajet par compute_route
    # (graphhopper_client._resolve_profile) : enregistré à titre informatif,
    # il doit refléter "Aucune limite" plutôt que toujours le profil par défaut.
    return settings.graphhopper_no_limit_profile if no_speed_limit else settings.graphhopper_profile


def _ev_to_json(ev: EvSettings | None) -> str | None:
    return json.dumps(ev.model_dump()) if ev else None


def _ev_from_json(raw: str | None) -> EvSettings | None:
    if not raw:
        return None
    try:
        return EvSettings(**json.loads(raw))
    except (ValueError, TypeError):
        # Réglage écrit par une version dont le schéma différait : le trajet
        # reste lisible, simplement sans son mode électrique.
        return None


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
        ev=_ev_from_json(route.ev_json),
    )


def _get_route_or_404(db: Session, route_id: int) -> Route:
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(404, "Trajet introuvable")
    return route


@router.post("/compute", response_model=ComputeRouteResponse)
async def compute_route(body: ComputeRouteRequest, db: Session = Depends(get_db)):
    validate_waypoints(body.waypoints)
    validate_avoid_zones(body.avoid_zones)
    routing_options = {
        "avoid_zones": body.avoid_zones or None,
        "speed_limit_kmh": body.speed_limit_kmh,
        "no_speed_limit": body.no_speed_limit,
    }
    path = await graphhopper_client.route(
        [(wp.lat, wp.lon) for wp in body.waypoints], **routing_options
    )
    response = path_to_response(path)
    if body.ev is None:
        return response
    # Mode électrique : ce premier tracé sert à savoir où les recharges sont
    # dues ; route_with_charging en recalcule un second qui passe par les
    # bornes retenues. La base sert de cache aux données IRVE de data.gouv.
    return await route_with_charging(
        db, body.waypoints, response, body.ev, **routing_options
    )


@router.post("/round-trip", response_model=ComputeRouteResponse)
async def compute_round_trip(body: RoundTripRequest):
    validate_waypoints([body.start])
    validate_via_points(body.via_points)
    validate_avoid_zones(body.avoid_zones)
    if body.distance_m > settings.max_round_trip_distance_m:
        raise HTTPException(400, f"Distance de circuit trop grande (max {settings.max_round_trip_distance_m} m)")
    path = await graphhopper_client.route_round_trip(
        (body.start.lat, body.start.lon),
        body.distance_m,
        body.seed,
        avoid_zones=body.avoid_zones or None,
        speed_limit_kmh=body.speed_limit_kmh,
        no_speed_limit=body.no_speed_limit,
    )
    raw_coordinates = path["points"]["coordinates"]
    if len(raw_coordinates) < 2:
        raise HTTPException(422, "Aucun circuit trouvé depuis ce point")
    # Laisse volontairement un emplacement libre sous settings.max_waypoints :
    # un circuit généré pile au plafond ne tolérerait plus aucune mutation
    # ultérieure (ajouter un point à la main, par exemple), qui échouerait
    # aussitôt sur ce même plafond via /compute. Les points de passage imposés
    # sont ajoutés à cette séquence juste en dessous : autant d'emplacements
    # en moins, sans quoi un circuit dense assorti de plusieurs points de
    # passage dépassait le plafond et faisait échouer son propre recalcul.
    round_trip_target = max(2, settings.max_waypoints - 1 - len(body.via_points))
    indices = subsample_indices(len(raw_coordinates), round_trip_target)
    # [lon, lat] ou [lon, lat, altitude] : l'altitude éventuelle est ignorée.
    waypoints = [WaypointOut(lat=raw_coordinates[i][1], lon=raw_coordinates[i][0]) for i in indices]
    # Les waypoints renvoyés sont des points du tracé lui-même : leurs indices
    # dans la géométrie sont les bornes de legs. Celles déduites de
    # snapped_waypoints ne décrivaient que le point de départ demandé, et ne
    # correspondaient donc pas aux waypoints renvoyés.
    response = path_to_response(path, waypoints=waypoints, leg_boundaries=indices)
    response.simplified = len(raw_coordinates) > round_trip_target
    if body.via_points:
        # Les points de passage ne sont pas sur le tracé généré (ils ont été
        # choisis avant même que le circuit existe) : ils n'ont donc pas
        # d'index dans sa géométrie, et les bornes de legs ne décrivent plus
        # les waypoints renvoyés. Le frontend recalcule de toute façon
        # l'itinéraire à travers ces points dès qu'il les reçoit (POST
        # /compute), ce qui produit des bornes cohérentes.
        response.waypoints = insert_via_points(waypoints, body.via_points)
        response.leg_boundaries = []
    return response


@router.post("/alternatives", response_model=AlternativesResponse)
async def compute_alternatives(body: AlternativesRequest):
    validate_waypoints(body.waypoints)
    paths = await graphhopper_client.route_alternatives(
        [(wp.lat, wp.lon) for wp in body.waypoints], no_speed_limit=body.no_speed_limit
    )
    return AlternativesResponse(alternatives=[path_to_response(p) for p in paths])


@router.get("", response_model=list[RouteOut] | list[RouteSummaryOut])
def list_routes(view: Literal["full", "summary"] = "full", db: Session = Depends(get_db)):
    """view=summary : liste allégée, sans points ni géométrie — seules les
    colonnes affichées dans la liste sont lues, au lieu de désérialiser
    jusqu'à plusieurs Mo de géométrie par trajet. Le détail complet s'obtient
    via GET /api/routes/{id}. view=full (défaut) est conservé pour les clients
    existants."""
    if view == "summary":
        rows = db.execute(
            select(
                Route.id,
                Route.name,
                Route.description,
                Route.distance_m,
                Route.duration_s,
                Route.is_favorite,
                Route.created_at,
                Route.updated_at,
            ).order_by(Route.created_at.desc())
        ).all()
        return [RouteSummaryOut.model_validate(dict(row._mapping)) for row in rows]
    routes = db.scalars(select(Route).order_by(Route.created_at.desc())).all()
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
        ev_json=_ev_to_json(body.ev),
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
    if "ev" in provided:
        route.ev_json = _ev_to_json(body.ev)

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
