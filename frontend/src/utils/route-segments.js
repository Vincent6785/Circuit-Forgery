/** Calculs purs sur la géométrie du tracé, sans dépendance à Leaflet :
 * testables hors navigateur, et partagés par map/route-layer.js. */

export const UNKNOWN_SPEED_COLOR = "#888888";

export function speedColor(speed) {
  if (speed == null) return UNKNOWN_SPEED_COLOR;
  if (speed <= 50) return "#2e7d32"; // vert
  if (speed <= 70) return "#f9a825"; // jaune/orange
  return "#e64a19"; // orange foncé — ne devrait jamais dépasser 80 km/h, le filtre l'exclut en amont
}

/** Regroupe les segments consécutifs de même couleur en tronçons.
 * coordinates : [[lon, lat], ...] (GeoJSON) ; maxSpeedBySegment[i] : vitesse
 * du segment coordinates[i] -> coordinates[i + 1]. Chaque tronçon renvoie ses
 * sommets en [lat, lon] (ordre Leaflet), sommets de jonction partagés entre
 * tronçons voisins pour que le tracé reste continu. Une polyline par tronçon
 * au lieu d'une par segment : quelques dizaines de couches au lieu de
 * plusieurs milliers sur un long trajet. */
export function groupRunsByColor(coordinates, maxSpeedBySegment = []) {
  const runs = [];
  let current = null;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const color = speedColor(maxSpeedBySegment?.[i] ?? null);
    if (!current || current.color !== color) {
      const [lon, lat] = coordinates[i];
      current = { color, latlngs: [[lat, lon]] };
      runs.push(current);
    }
    const [lon, lat] = coordinates[i + 1];
    current.latlngs.push([lat, lon]);
  }
  return runs;
}

/** Segment [points[i], points[i + 1]] le plus proche de `p`, dans un repère
 * plan (pixels). Renvoie { index, x, y } où (x, y) est le point le plus
 * proche sur ce segment, ou null s'il n'y a aucun segment. */
export function nearestSegment(points, p) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = { index: i, x, y };
    }
  }
  return best;
}

/** Index de la paire de waypoints consécutifs (leg) contenant le segment
 * coordIndex. legBoundaries[i] est l'index, dans les coordonnées du tracé, du
 * waypoint i (voir backend/app/services/route_enrichment.py). Borné à la
 * dernière paire valide, pour qu'une insertion reste toujours *entre* deux
 * waypoints existants, jamais après l'arrivée. */
export function legIndexForCoordIndex(legBoundaries, coordIndex) {
  if (!legBoundaries || legBoundaries.length < 2) return 0;
  let legIndex = 0;
  for (let i = 0; i < legBoundaries.length; i++) {
    if (legBoundaries[i] <= coordIndex) legIndex = i;
    else break;
  }
  return Math.min(legIndex, legBoundaries.length - 2);
}
