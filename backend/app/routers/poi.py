from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import PointOfInterest
from app.db.session import get_db
from app.schemas.route import PointOfInterestCreate, PointOfInterestOut

router = APIRouter(prefix="/api/poi", tags=["poi"])


@router.get("", response_model=list[PointOfInterestOut])
def list_poi(db: Session = Depends(get_db)):
    return db.query(PointOfInterest).order_by(PointOfInterest.created_at.desc()).all()


@router.post("", response_model=PointOfInterestOut, status_code=201)
def create_poi(body: PointOfInterestCreate, db: Session = Depends(get_db)):
    poi = PointOfInterest(**body.model_dump())
    db.add(poi)
    db.commit()
    db.refresh(poi)
    return poi


@router.delete("/{poi_id}", status_code=204)
def delete_poi(poi_id: int, db: Session = Depends(get_db)):
    poi = db.get(PointOfInterest, poi_id)
    if poi is None:
        raise HTTPException(404, "Point d'intérêt introuvable")
    db.delete(poi)
    db.commit()
