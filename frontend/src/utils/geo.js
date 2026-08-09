const EARTH_RADIUS_M = 6_371_000;

/** Distance à vol d'oiseau entre deux points {lat, lon}, en mètres — miroir
 * du `_haversine_m` déjà existant côté backend (services/route_enrichment.py),
 * jamais partagé côté client jusqu'ici. */
export function haversineMeters(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Index i tel qu'insérer `point` entre waypoints[i] et waypoints[i+1]
 * minimise le détour à vol d'oiseau — heuristique "insertion la moins
 * coûteuse", suffisante pour choisir un point d'insertion raisonnable avant
 * de laisser le routage réel calculer le tracé précis. */
export function cheapestInsertionIndex(waypoints, point) {
  let bestIndex = 0;
  let bestCost = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const cost = haversineMeters(a, point) + haversineMeters(point, b) - haversineMeters(a, b);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i;
    }
  }
  return bestIndex;
}
