import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.body_limit import BodySizeLimitMiddleware
from app.core.config import settings
from app.core.errors import install_exception_handlers
from app.db.session import init_db
from app.routers import geocode, gpx, health, poi, routes
from app.services.geocoding_client import geocoding_client
from app.services.graphhopper_client import graphhopper_client

# Sans configuration, les journaux de l'application (erreurs amont de
# GraphHopper ou Nominatim, notamment) n'étaient écrits nulle part. Sans
# effet si un gestionnaire est déjà configuré (tests, lancement embarqué).
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s : %(message)s")

# Marge pour l'enveloppe multipart (en-têtes de partie, délimiteurs) autour du
# fichier GPX lui-même, borné par max_gpx_upload_bytes.
_MULTIPART_OVERHEAD_BYTES = 64_000


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    # Ferme les pools de connexions HTTP partagés (GraphHopper, Nominatim).
    await graphhopper_client.aclose()
    await geocoding_client.aclose()


app = FastAPI(title="Circuit Forgery", lifespan=lifespan)
install_exception_handlers(app)

app.add_middleware(
    BodySizeLimitMiddleware,
    default_limit=settings.max_request_body_bytes,
    path_limits={"/api/gpx/import": settings.max_gpx_upload_bytes + _MULTIPART_OVERHEAD_BYTES},
)

app.include_router(health.router)
app.include_router(routes.router)
app.include_router(poi.router)
app.include_router(geocode.router)
app.include_router(gpx.router)

_frontend_dist = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
