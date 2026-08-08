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

/** Passe une zone du format JS ({lat, lon, radiusM}) au format attendu par
 * l'API ({lat, lon, radius_m}). */
export function toApiAvoidZones(zones) {
  return zones.map((z) => ({ lat: z.lat, lon: z.lon, radius_m: z.radiusM }));
}

/** Sens inverse, pour recharger les zones d'un trajet sauvegardé. */
export function fromApiAvoidZones(zones) {
  return (zones || []).map((z) => ({ lat: z.lat, lon: z.lon, radiusM: z.radius_m }));
}

export function computeRoute(waypoints, avoidZones = [], speedLimitKmh = null, noSpeedLimit = false) {
  return _postJson(
    "/api/routes/compute",
    {
      waypoints,
      avoid_zones: toApiAvoidZones(avoidZones),
      speed_limit_kmh: speedLimitKmh,
      no_speed_limit: noSpeedLimit,
    },
    "Erreur de calcul d'itinéraire"
  );
}

export function computeRoundTrip(start, distanceM, seed, speedLimitKmh = null, noSpeedLimit = false) {
  return _postJson(
    "/api/routes/round-trip",
    { start, distance_m: distanceM, seed, speed_limit_kmh: speedLimitKmh, no_speed_limit: noSpeedLimit },
    "Erreur de génération du circuit"
  );
}

export function computeAlternatives(waypoints, noSpeedLimit = false) {
  return _postJson(
    "/api/routes/alternatives",
    { waypoints, no_speed_limit: noSpeedLimit },
    "Erreur de calcul des itinéraires alternatifs"
  );
}
