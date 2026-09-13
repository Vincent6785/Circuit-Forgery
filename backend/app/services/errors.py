class InvalidInputError(ValueError):
    """Entrée refusée par une règle métier (point hors de France, trop de
    points ou de zones…). Indépendante de FastAPI : convertie en réponse 400
    par app/core/errors.py."""
