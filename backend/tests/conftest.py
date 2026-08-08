import os

# Doit être défini avant tout import de app.* : app.db.session crée l'engine
# SQLite au moment de l'import, à partir de settings.database_path. Sans
# override ici, le défaut de production (/data/circuit-forgery.db) échoue en
# local (pas de droits sur /). Ce moteur "réel" n'est de toute façon jamais
# utilisé par les tests (cf. fixture `client` ci-dessous qui override get_db).
os.environ.setdefault("CF_DATABASE_PATH", "/tmp/circuit-forgery-test-placeholder.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.db.models  # noqa: E402,F401  (enregistre les modèles auprès de Base)
from app.db.session import Base, get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = session_local()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()
