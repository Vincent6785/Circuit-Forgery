import math
from typing import Optional

from app.schemas.route import AvoidZone

_EARTH_RADIUS_M = 6_371_000


def circle_to_polygon(lat: float, lon: float, radius_m: float, n: int = 24) -> list[list[float]]:
    """Approxime un cercle (centre lat/lon, rayon en mètres) par un polygone
    régulier à n sommets, au format [lon, lat] attendu par le GeoJSON `areas`
    de GraphHopper. Le polygone est fermé : le premier sommet est répété en
    dernière position."""
    lat_rad = math.radians(lat)
    coords = []
    for i in range(n):
        angle = 2 * math.pi * i / n
        d_lat = (radius_m * math.cos(angle)) / _EARTH_RADIUS_M
        d_lon = (radius_m * math.sin(angle)) / (_EARTH_RADIUS_M * math.cos(lat_rad))
        coords.append([lon + math.degrees(d_lon), lat + math.degrees(d_lat)])
    coords.append(coords[0])
    return coords


def build_custom_model(avoid_zones: list[AvoidZone], speed_limit_kmh: Optional[float] = None) -> dict:
    """Construit un `custom_model` GraphHopper qui exclut chaque zone et,
    optionnellement, resserre le seuil de vitesse en dessous de celui du
    profil de base. Ce custom_model se fusionne côté GraphHopper avec celui
    du profil plutôt que de le remplacer — vérifié empiriquement que le
    filtre anti-80km/h du profil reste actif en plus de ces règles, et
    qu'une règle envoyée ici ne peut donc qu'ajouter une restriction, jamais
    lever celle du profil (une exclusion à 0 reste à 0 quel que soit ce qui
    est multiplié ensuite)."""
    areas = {}
    priority_rules = []
    for i, zone in enumerate(avoid_zones):
        area_id = f"avoid_{i}"
        areas[area_id] = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [circle_to_polygon(zone.lat, zone.lon, zone.radius_m)],
            },
        }
        priority_rules.append({"if": f"in_{area_id}", "multiply_by": "0"})
    if speed_limit_kmh is not None:
        priority_rules.append({"if": f"max_speed > {speed_limit_kmh} && max_speed < 1000", "multiply_by": "0"})
    return {"areas": areas, "priority": priority_rules}
