import math

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Champs conservés d'une erreur de validation Pydantic. "input" (la valeur
# refusée) est volontairement omis : il peut s'agir d'une géométrie de
# plusieurs Mo, renvoyée telle quelle au client, ou d'un NaN que le JSON ne
# sait pas représenter.
_KEPT_ERROR_FIELDS = ("type", "loc", "msg", "ctx")


def _json_safe(value):
    """Rend une valeur sérialisable en JSON strict : NaN/±Infinity et objets
    arbitraires (exceptions dans ctx, notamment) deviennent des chaînes."""
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return str(value)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Réponse 422 équivalente à celle de FastAPI, mais toujours
    sérialisable : le gestionnaire par défaut renvoyait la valeur refusée, et
    échouait en 500 dès qu'elle contenait NaN ou Infinity — précisément les
    valeurs que la validation doit rejeter proprement."""
    errors = [
        {field: _json_safe(error[field]) for field in _KEPT_ERROR_FIELDS if field in error}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})
