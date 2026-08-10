import re
import xml.etree.ElementTree as ET

from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring as defused_fromstring

from app.schemas.route import Waypoint
from app.services.geo_sampling import subsample

GPX_NS = "http://www.topografix.com/GPX/1/1"


# Caractères de contrôle illégaux en XML 1.0 (hors tabulation/saut de ligne/
# retour chariot, valides eux) : rien ne les empêche d'atteindre un nom de
# trajet ou un label de waypoint (seule la longueur est validée côté schéma),
# et leur présence produirait un .gpx mal formé, rejeté par la plupart des
# lecteurs XML — y compris le propre import de l'app (defusedxml).
_XML_ILLEGAL_CONTROL_CHARS = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _escape(text: str) -> str:
    text = _XML_ILLEGAL_CONTROL_CHARS.sub("", text)
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def build_gpx(name: str, waypoints: list[Waypoint], geometry_geojson: dict) -> str:
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
        for lon, lat in coordinates:
            lines.append(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}" />')
        lines.append("    </trkseg>")
        lines.append("  </trk>")

    lines.append("</gpx>")
    return "\n".join(lines)


def _parse_points(elements: list, ns: str) -> list[Waypoint]:
    points = []
    for el in elements:
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None or lon is None:
            continue
        name_el = el.find(f"{ns}name")
        label = name_el.text if name_el is not None else None
        points.append(Waypoint(lat=float(lat), lon=float(lon), label=label))
    return points


def parse_gpx(content: bytes, max_waypoints: int) -> tuple[list[Waypoint], bool]:
    """Extrait les waypoints d'un fichier GPX, par ordre de priorité :
    <rte>/<rtept>, puis <wpt>, et en dernier recours un <trk> sous-échantillonné
    (souvent plusieurs milliers de points, bien au-delà de max_waypoints).
    Le second élément du tuple indique si un troncage/sous-échantillonnage a
    été nécessaire pour respecter la limite."""
    try:
        root = defused_fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"Fichier GPX invalide : {exc}") from exc
    except DefusedXmlException as exc:
        raise ValueError(f"Fichier GPX refusé (contenu XML non sûr) : {exc}") from exc

    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"

    rtepts = root.findall(f"{ns}rte/{ns}rtept")
    if rtepts:
        points = _parse_points(rtepts, ns)
        return points[:max_waypoints], len(points) > max_waypoints

    wpts = root.findall(f"{ns}wpt")
    if wpts:
        points = _parse_points(wpts, ns)
        return points[:max_waypoints], len(points) > max_waypoints

    trkpts = root.findall(f"{ns}trk/{ns}trkseg/{ns}trkpt")
    if trkpts:
        points = _parse_points(trkpts, ns)
        return subsample(points, max_waypoints), len(points) > max_waypoints

    raise ValueError("Aucun point trouvé dans le fichier GPX (attendu : rte, wpt ou trk)")
