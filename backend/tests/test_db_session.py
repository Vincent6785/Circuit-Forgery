from app.db.session import ensure_database_dir


def test_ensure_database_dir_accepts_bare_filename(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ensure_database_dir("bare-filename.db")  # ne doit pas lever


def test_ensure_database_dir_creates_missing_nested_directory(tmp_path):
    target_dir = tmp_path / "nested" / "sub"
    ensure_database_dir(str(target_dir / "circuit-forgery.db"))
    assert target_dir.is_dir()
