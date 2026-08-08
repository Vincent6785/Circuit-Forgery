from fastapi import APIRouter, HTTPException, Query

from app.schemas.route import GeocodeResult
from app.services.geocoding_client import geocoding_client

router = APIRouter(prefix="/api", tags=["geocode"])


@router.get("/geocode", response_model=list[GeocodeResult])
async def geocode(q: str = Query(..., min_length=3)):
    try:
        return await geocoding_client.search(q)
    except Exception as exc:
        raise HTTPException(503, f"Recherche d'adresse indisponible : {exc}") from exc
