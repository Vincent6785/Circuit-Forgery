import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


os.makedirs(os.path.dirname(settings.database_path), exist_ok=True)

engine = create_engine(f"sqlite:///{settings.database_path}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    from app.db import models  # noqa: F401  (enregistre les modèles auprès de Base)

    Base.metadata.create_all(bind=engine)
    _apply_additive_migrations()


def _apply_additive_migrations() -> None:
    """create_all() ne modifie jamais le schéma d'une table déjà existante : sur
    une base SQLite créée par une version antérieure de l'app, une nouvelle
    colonne nullable doit être ajoutée à la main. Pattern volontairement léger
    (pas d'Alembic) proportionné à un outil local mono/quelques utilisateurs —
    toute future colonne nullable s'ajoute ici de la même façon."""
    with engine.begin() as conn:
        existing_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(routes)"))}
        if "updated_at" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN updated_at DATETIME"))
        if "avoid_zones_json" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN avoid_zones_json TEXT"))


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
