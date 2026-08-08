import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.db.session import init_db
from app.routers import geocode, gpx, health, poi, routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Circuit Forgery", lifespan=lifespan)

app.include_router(health.router)
app.include_router(routes.router)
app.include_router(poi.router)
app.include_router(geocode.router)
app.include_router(gpx.router)

_frontend_dist = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
