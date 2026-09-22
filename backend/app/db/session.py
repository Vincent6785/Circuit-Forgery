import os
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# Attente maximale d'un verrou SQLite avant d'échouer (écriture concurrente).
_BUSY_TIMEOUT_MS = 5000


class Base(DeclarativeBase):
    pass


def ensure_database_dir(database_path: str) -> None:
    # os.makedirs("") lève FileNotFoundError : un CF_DATABASE_PATH sans
    # composante de répertoire (ex. "circuit-forgery.db", chemin relatif
    # plausible hors Docker) plantait donc dès l'import de ce module.
    directory = os.path.dirname(database_path)
    if directory:
        os.makedirs(directory, exist_ok=True)


def create_sqlite_engine(database_path: str) -> Engine:
    """Engine SQLite configuré pour un serveur web : mode WAL (les lectures ne
    sont plus bloquées par une écriture en cours) et attente d'un verrou
    plutôt qu'un échec immédiat "database is locked"."""
    engine = create_engine(f"sqlite:///{database_path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _configure_connection(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
        finally:
            cursor.close()

    return engine


ensure_database_dir(settings.database_path)

engine = create_sqlite_engine(settings.database_path)
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
        if "ev_json" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN ev_json TEXT"))
        if "charging_stops_json" not in existing_columns:
            conn.execute(text("ALTER TABLE routes ADD COLUMN charging_stops_json TEXT"))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
