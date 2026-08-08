async function _postJson(url, body, fallbackMessage) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${fallbackMessage} (${res.status})`);
  }
  return res.json();
}

/** Convertit une zone JS ({lat, lon, radiusM}) au format attendu par l'API
 * ({lat, lon, radius_m}). */
export function toApiAvoidZones(zones) {
  return zones.map((z) => ({ lat: z.lat, lon: z.lon, radius_m: z.radiusM }));
}

/** Conversion inverse, pour charger les zones d'un trajet sauvegardé. */
export function fromApiAvoidZones(zones) {
  return (zones || []).map((z) => ({ lat: z.lat, lon: z.lon, radiusM: z.radius_m }));
}

export function computeRoute(waypoints, avoidZones = []) {
  return _postJson(
    "/api/routes/compute",
    { waypoints, avoid_zones: toApiAvoidZones(avoidZones) },
    "Erreur de calcul d'itinéraire"
  );
}

export function computeRoundTrip(start, distanceM, seed) {
  return _postJson(
    "/api/routes/round-trip",
    { start, distance_m: distanceM, seed },
    "Erreur de génération du circuit"
  );
}

export function computeAlternatives(waypoints) {
  return _postJson(
    "/api/routes/alternatives",
    { waypoints },
    "Erreur de calcul des itinéraires alternatifs"
  );
}
