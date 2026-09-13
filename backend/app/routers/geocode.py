import logging

from fastapi import APIRouter, HTTPException, Query

from app.schemas.route import GeocodeResult
from app.services.geocoding_client import geocoding_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["geocode"])


@router.get("/geocode", response_model=list[GeocodeResult])
async def geocode(q: str = Query(..., min_length=3, max_length=200)):
    try:
        return await geocoding_client.search(q)
    except Exception:
        # Le détail (URL amont, réponse inattendue de Nominatim) reste dans
        # les journaux : il n'a pas à être renvoyé au client.
        logger.exception("Échec de la recherche d'adresse")
        raise HTTPException(503, "Recherche d'adresse indisponible pour le moment.") from None
