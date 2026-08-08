from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.graphhopper_client import graphhopper_client

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    graphhopper_ok = await graphhopper_client.health()

    db_ok = True
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception:
        db_ok = False

    return {"graphhopper": graphhopper_ok, "database": db_ok}
