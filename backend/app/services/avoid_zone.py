import math

from app.schemas.route import AvoidZone

_EARTH_RADIUS_M = 6_371_000


def circle_to_polygon(lat: float, lon: float, radius_m: float, n: int = 24) -> list[list[float]]:
    """Approxime un cercle (centre lat/lon, rayon en mètres) par un polygone
    régulier à n sommets, au format [lon, lat] attendu par le GeoJSON
    `areas` de GraphHopper. Polygone fermé (premier sommet répété en dernier)."""
    lat_rad = math.radians(lat)
    coords = []
    for i in range(n):
        angle = 2 * math.pi * i / n
        d_lat = (radius_m * math.cos(angle)) / _EARTH_RADIUS_M
        d_lon = (radius_m * math.sin(angle)) / (_EARTH_RADIUS_M * math.cos(lat_rad))
        coords.append([lon + math.degrees(d_lon), lat + math.degrees(d_lat)])
    coords.append(coords[0])
    return coords


def build_custom_model(avoid_zones: list[AvoidZone]) -> dict:
    """Construit un `custom_model` GraphHopper excluant chaque zone (fusionné
    côté GraphHopper par-dessus le custom_model du profil de base — vérifié
    empiriquement que le filtre anti->80km/h du profil reste actif)."""
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
    return {"areas": areas, "priority": priority_rules}
