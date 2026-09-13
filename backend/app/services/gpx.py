import math
import re
import xml.etree.ElementTree as ET

from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring as defused_fromstring

from app.schemas.route import MAX_LABEL_LENGTH, Waypoint, WaypointOut
from app.services.geo_sampling import subsample

GPX_NS = "http://www.topografix.com/GPX/1/1"


# Caractères illégaux en XML 1.0 : contrôles C0 (hors tabulation/saut de
# ligne/retour chariot, valides eux) et non-caractères U+FFFE/U+FFFF (les
# surrogates isolés sont déjà refusés par la validation JSON). Rien ne les
# empêche d'atteindre un nom de trajet ou un label de waypoint (seule la
# longueur est validée côté schéma), et leur présence produirait un .gpx mal
# formé, rejeté par la plupart des lecteurs XML — y compris le propre import
# de l'app (defusedxml).
_XML_ILLEGAL_CONTROL_CHARS = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")


def _escape(text: str) -> str:
    text = _XML_ILLEGAL_CONTROL_CHARS.sub("", text)
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def build_gpx(name: str, waypoints: list[WaypointOut], geometry_geojson: dict) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<gpx version="1.1" creator="circuit-forgery" xmlns="{GPX_NS}">',
        f"  <metadata><name>{_escape(name)}</name></metadata>",
        "  <rte>",
        f"    <name>{_escape(name)}</name>",
    ]
    for i, wp in enumerate(waypoints):
        label = wp.label or f"Point {i + 1}"
        lines.append(
            f'    <rtept lat="{wp.lat:.6f}" lon="{wp.lon:.6f}"><name>{_escape(label)}</name></rtept>'
        )
    lines.append("  </rte>")

    coordinates = geometry_geojson.get("coordinates", [])
    if coordinates:
        lines.append("  <trk>")
        lines.append(f"    <name>{_escape(name)}</name>")
        lines.append("    <trkseg>")
        for coordinate in coordinates:
            # [lon, lat] ou [lon, lat, altitude] : l'altitude éventuelle n'est pas exportée.
            lon, lat = coordinate[0], coordinate[1]
            lines.append(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}" />')
        lines.append("    </trkseg>")
        lines.append("  </trk>")

    lines.append("</gpx>")
    return "\n".join(lines)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _coordinate(value: str | None, bound: float) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or not -bound <= number <= bound:
        return None
    return number


def _parse_points(elements: list, ns: str) -> list[Waypoint]:
    """Points exploitables d'une liste d'éléments GPX : un point sans
    coordonnées, ou aux coordonnées non numériques, non finies ou hors bornes,
    est ignoré plutôt que de faire échouer tout l'import."""
    points = []
    for el in elements:
        lat = _coordinate(el.get("lat"), 90)
        lon = _coordinate(el.get("lon"), 180)
        if lat is None or lon is None:
            continue
        name_el = el.find(f"{ns}name")
        label = (name_el.text or "").strip()[:MAX_LABEL_LENGTH] if name_el is not None else ""
        points.append(Waypoint(lat=lat, lon=lon, label=label or None))
    return points


def parse_gpx(content: bytes, max_waypoints: int) -> tuple[list[Waypoint], bool]:
    """Extrait les waypoints d'un fichier GPX, par ordre de priorité :
    <rte>/<rtept>, puis <wpt>, puis <trk>. Une source qui ne fournit pas au
    moins deux points exploitables cède la place à la suivante.

    Au-delà de max_waypoints, les points sont sous-échantillonnés en gardant
    départ et arrivée — un simple troncage perdait l'arrivée d'un long
    trajet. Le second élément du tuple indique si c'était nécessaire."""
    try:
        root = defused_fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"Fichier GPX invalide : {exc}") from exc
    except DefusedXmlException as exc:
        raise ValueError(f"Fichier GPX refusé (contenu XML non sûr) : {exc}") from exc

    if _local_name(root.tag) != "gpx":
        raise ValueError("Fichier GPX invalide : élément racine <gpx> attendu")

    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"

    best: list[Waypoint] = []
    for path in (f"{ns}rte/{ns}rtept", f"{ns}wpt", f"{ns}trk/{ns}trkseg/{ns}trkpt"):
        points = _parse_points(root.findall(path), ns)
        if len(points) >= 2:
            return subsample(points, max_waypoints), len(points) > max_waypoints
        if points and not best:
            best = points

    if best:
        # Un seul point exploitable : renvoyé tel quel, l'appelant signale
        # qu'il en faut au moins deux.
        return best, False
    raise ValueError("Aucun point trouvé dans le fichier GPX (attendu : rte, wpt ou trk)")
