from app.db.session import ensure_database_dir


def test_ensure_database_dir_accepts_bare_filename(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ensure_database_dir("bare-filename.db")  # ne doit pas lever


def test_ensure_database_dir_creates_missing_nested_directory(tmp_path):
    target_dir = tmp_path / "nested" / "sub"
    ensure_database_dir(str(target_dir / "circuit-forgery.db"))
    assert target_dir.is_dir()


def test_additive_migrations_upgrade_old_routes_table(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, inspect, text

    from app.db import session as session_module

    engine = create_engine(f"sqlite:///{tmp_path / 'ancienne.db'}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE routes (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, description TEXT, "
                "waypoints_json TEXT NOT NULL, profile VARCHAR NOT NULL, distance_m FLOAT NOT NULL, "
                "duration_s FLOAT NOT NULL, geometry_geojson TEXT NOT NULL, is_favorite BOOLEAN NOT NULL, "
                "created_at DATETIME NOT NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO routes (name, waypoints_json, profile, distance_m, duration_s, geometry_geojson, "
                "is_favorite, created_at) VALUES ('ancien', '[]', 'moto_no_fast', 1, 1, '{}', 0, '2025-01-01')"
            )
        )
    monkeypatch.setattr(session_module, "engine", engine)

    session_module._apply_additive_migrations()
    session_module._apply_additive_migrations()  # idempotent

    columns = {column["name"] for column in inspect(engine).get_columns("routes")}
    assert {"updated_at", "avoid_zones_json", "speed_limit_kmh", "no_speed_limit"} <= columns
    with engine.connect() as conn:
        assert conn.execute(text("SELECT no_speed_limit FROM routes")).scalar_one() == 0
    engine.dispose()


def test_create_sqlite_engine_enables_wal_and_busy_timeout(tmp_path):
    from sqlalchemy import text

    from app.db.session import create_sqlite_engine

    engine = create_sqlite_engine(str(tmp_path / "wal.db"))
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA journal_mode")).scalar_one() == "wal"
        assert conn.execute(text("PRAGMA busy_timeout")).scalar_one() == 5000
    engine.dispose()
