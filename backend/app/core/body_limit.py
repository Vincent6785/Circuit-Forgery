import json

from fastapi import HTTPException


def _too_large_message(limit: int) -> str:
    return f"Requête trop volumineuse (max {limit} octets)"


def _declared_content_length(scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


class BodySizeLimitMiddleware:
    """Rejette en 413 un corps de requête plus gros que la limite de son
    chemin, avant qu'il ne soit entièrement lu et analysé.

    Les validations de schéma (taille de géométrie, nombre de points…)
    n'interviennent qu'une fois le JSON entièrement décodé en mémoire : elles
    protègent la base, pas le processus. Ce middleware refuse d'emblée un
    Content-Length annoncé trop grand et, pour un corps transmis par morceaux
    (sans Content-Length), interrompt la lecture dès que la limite est
    franchie."""

    def __init__(self, app, default_limit: int, path_limits: dict[str, int] | None = None):
        self.app = app
        self.default_limit = default_limit
        self.path_limits = path_limits or {}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self.path_limits.get(scope["path"], self.default_limit)
        declared = _declared_content_length(scope)
        if declared is not None and declared > limit:
            body = json.dumps({"detail": _too_large_message(limit)}).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Levée pendant la lecture du corps par la route : FastAPI
                    # la propage telle quelle et la convertit en réponse 413.
                    raise HTTPException(413, _too_large_message(limit))
            return message

        await self.app(scope, limited_receive, send)
