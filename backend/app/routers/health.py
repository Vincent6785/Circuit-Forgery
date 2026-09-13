import asyncio
import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.graphhopper_client import graphhopper_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


def _database_ok() -> bool:
    # Synchrone (SQLAlchemy/sqlite3) : exécuté dans le pool de threads pour ne
    # pas bloquer la boucle d'événements.
    db = None
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("Base de données indisponible")
        return False
    finally:
        if db is not None:
            db.close()


async def _status() -> dict:
    graphhopper_ok, database_ok = await asyncio.gather(graphhopper_client.health(), run_in_threadpool(_database_ok))
    return {
        "status": "ok" if graphhopper_ok and database_ok else "degraded",
        "graphhopper": graphhopper_ok,
        "database": database_ok,
    }


@router.get("/health")
async def health():
    """État détaillé des dépendances, toujours en 200 : le corps indique ce
    qui est en panne (status "degraded")."""
    return await _status()


@router.get("/health/live")
async def live():
    """Vivacité du serveur seul, sans dépendance : sonde du healthcheck
    Docker, appelée toutes les 30 s."""
    return {"status": "ok"}


@router.get("/health/ready")
async def ready():
    """Disponibilité réelle : 503 tant que GraphHopper ou la base ne
    répondent pas (import du graphe en cours, par exemple)."""
    body = await _status()
    return JSONResponse(body, status_code=200 if body["status"] == "ok" else 503)
