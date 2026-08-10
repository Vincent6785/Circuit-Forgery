import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def ensure_database_dir(database_path: str) -> None:
    # os.makedirs("") lève FileNotFoundError : un CF_DATABASE_PATH sans
    # composante de répertoire (ex. "circuit-forgery.db", chemin relatif
    # plausible hors Docker) plantait donc dès l'import de ce module.
    directory = os.path.dirname(database_path)
    if directory:
        os.makedirs(directory, exist_ok=True)


ensure_database_dir(settings.database_path)

engine = create_engine(f"sqlite:///{settings.database_path}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    from app.db import models  # noqa: F401  (import nécessaire pour enregistrer les modèles auprès de Base)

    Base.metadata.create_all(bind=engine)
    _apply_additive_migrations()


def _apply_additive_migrations() -> None:
    """create_all() ne touche jamais au schéma d'une table déjà existante :
    sur une base SQLite créée par une version antérieure de l'app, une
    nouvelle colonne nullable doit donc être ajoutée à la main ici. Choix
    volontairement léger (pas d'Alembic), proportionné à un outil local pour
    un usage mono ou quelques utilisateurs — toute future colonne nullable
    suit le même schéma."""
    with engine.begin() as conn:
        existing_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(routes)"))}
        if "updated_at" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN updated_at DATETIME"))
        if "avoid_zones_json" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN avoid_zones_json TEXT"))
        if "speed_limit_kmh" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN speed_limit_kmh FLOAT"))
        if "no_speed_limit" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN no_speed_limit BOOLEAN NOT NULL DEFAULT 0"))


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
