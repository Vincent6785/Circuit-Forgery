from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(prefix="/api", tags=["config"])


class ClientConfig(BaseModel):
    tile_url: str
    tile_attribution: str


@router.get("/config", response_model=ClientConfig)
def client_config():
    """Réglages d'affichage du frontend fixés côté serveur (fond de carte),
    pour qu'ils restent cohérents avec la Content-Security-Policy."""
    return ClientConfig(tile_url=settings.tile_url, tile_attribution=settings.tile_attribution)
