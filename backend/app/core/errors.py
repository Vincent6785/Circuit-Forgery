import math

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.services.errors import InvalidInputError
from app.services.graphhopper_client import GraphHopperRouteNotFoundError, GraphHopperUnavailableError

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


def _detail_handler(status_code: int):
    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": str(exc)})

    return handler


def install_exception_handlers(app: FastAPI) -> None:
    """Traduit les erreurs du domaine en réponses HTTP en un seul endroit,
    plutôt que dans chaque route :
    - InvalidInputError (règle métier) → 400 ;
    - GraphHopperRouteNotFoundError (itinéraire impossible) → 422 ;
    - GraphHopperUnavailableError (moteur indisponible) → 503, avec un
      message générique (le détail est journalisé par le client)."""
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(InvalidInputError, _detail_handler(400))
    app.add_exception_handler(GraphHopperRouteNotFoundError, _detail_handler(422))
    app.add_exception_handler(GraphHopperUnavailableError, _detail_handler(503))
