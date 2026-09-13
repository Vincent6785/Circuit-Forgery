import json
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Route
from app.db.session import get_db
from app.schemas.route import GpxImportResponse, WaypointOut
from app.services.gpx import build_gpx, parse_gpx
from app.services.waypoint_validation import validate_waypoints

router = APIRouter(prefix="/api", tags=["gpx"])

_UNSAFE_ASCII_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._ -]")


def _content_disposition(route_name: str) -> str:
    """filename (ASCII, pour les clients qui ignorent filename*) et filename*
    (UTF-8, prioritaire pour les autres), cf. RFC 6266."""
    filename = f"{route_name.strip() or 'trajet'}.gpx"
    ascii_fallback = _UNSAFE_ASCII_FILENAME_CHARS.sub("_", filename)
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


@router.get("/routes/{route_id}/export.gpx")
def export_gpx(route_id: int, db: Session = Depends(get_db)):
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(404, "Trajet introuvable")
    waypoints = [WaypointOut(**wp) for wp in json.loads(route.waypoints_json)]
    geometry = json.loads(route.geometry_geojson)
    gpx_xml = build_gpx(route.name, waypoints, geometry)
    return Response(
        content=gpx_xml,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": _content_disposition(route.name)},
    )


@router.post("/gpx/import", response_model=GpxImportResponse)
async def import_gpx(file: UploadFile = File(...)):
    content = await file.read(settings.max_gpx_upload_bytes + 1)
    if len(content) > settings.max_gpx_upload_bytes:
        raise HTTPException(413, f"Fichier GPX trop volumineux (max {settings.max_gpx_upload_bytes} octets)")
    # Comme pour le circuit en boucle (routers/routes.py) : un emplacement
    # reste libre sous max_waypoints, pour qu'ajouter un point juste après
    # l'import ne heurte pas aussitôt la limite.
    try:
        waypoints, truncated = parse_gpx(content, max(2, settings.max_waypoints - 1))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if len(waypoints) < 2:
        raise HTTPException(400, "Le fichier GPX doit contenir au moins 2 points")
    validate_waypoints(waypoints)
    return GpxImportResponse(waypoints=[wp.model_dump() for wp in waypoints], truncated=truncated)
