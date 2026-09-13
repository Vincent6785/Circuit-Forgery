import re
from urllib.parse import urlsplit

_PLACEHOLDER = re.compile(r"\{[^}]+\}")


def tile_origin(tile_url: str) -> str:
    """Origine à autoriser dans img-src pour un gabarit d'URL de tuiles.
    Un sous-domaine variable ({s}.tile.example.org) devient un joker
    (*.tile.example.org), la seule forme que la CSP sait exprimer."""
    parts = urlsplit(tile_url)
    host = parts.hostname or ""
    labels = host.split(".")
    if labels and _PLACEHOLDER.search(labels[0]):
        host = ".".join(["*", *labels[1:]])
    port = f":{parts.port}" if parts.port else ""
    return f"{parts.scheme}://{host}{port}"


def build_content_security_policy(tile_url: str) -> str:
    # style-src 'unsafe-inline' : Leaflet positionne cartes, tuiles et
    # marqueurs par attributs style ; les scripts, eux, restent limités au
    # bundle servi par l'application (aucun script inline).
    directives = {
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "img-src": f"'self' data: {tile_origin(tile_url)}",
        "connect-src": "'self'",
        "font-src": "'self'",
        "object-src": "'none'",
        "base-uri": "'self'",
        "form-action": "'self'",
        "frame-ancestors": "'none'",
    }
    return "; ".join(f"{name} {value}" for name, value in directives.items())


class SecurityHeadersMiddleware:
    """En-têtes de sécurité ajoutés à chaque réponse HTTP (API et frontend
    servi par StaticFiles), sans écraser un en-tête déjà défini par la route.

    Middleware ASGI pur plutôt que BaseHTTPMiddleware : n'intercepte que le
    message de démarrage de réponse, sans mettre le corps en mémoire."""

    def __init__(self, app, tile_url: str):
        self.app = app
        csp = build_content_security_policy(tile_url)
        self.headers = [
            (b"content-security-policy", csp.encode()),
            (b"x-content-type-options", b"nosniff"),
            # Origine seule vers un autre site : le serveur de tuiles reçoit un
            # Referer valide, comme l'exige la politique d'usage d'OpenStreetMap.
            (b"referrer-policy", b"strict-origin-when-cross-origin"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
            (b"x-frame-options", b"DENY"),
        ]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    (name, value) for name, value in self.headers if name not in existing
                ]
            await send(message)

        await self.app(scope, receive, send_with_headers)
