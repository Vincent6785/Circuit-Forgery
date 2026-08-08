import os

# À définir avant tout import de app.* : app.db.session construit l'engine
# SQLite dès l'import, à partir de settings.database_path. Sans cet override,
# le chemin de production par défaut (/data/circuit-forgery.db) échoue en
# local faute de droits sur /. Cet engine "réel" n'est de toute façon jamais
# sollicité par les tests — la fixture `client` ci-dessous redirige get_db
# vers une base en mémoire.
os.environ.setdefault("CF_DATABASE_PATH", "/tmp/circuit-forgery-test-placeholder.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.db.models  # noqa: E402,F401  (import nécessaire pour enregistrer les modèles auprès de Base)
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
