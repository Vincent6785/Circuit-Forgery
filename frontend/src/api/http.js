const DEFAULT_TIMEOUT_MS = 35_000;

/** fetch() avec un timeout par défaut (AbortController) : sans ça, un
 * backend qui se bloque (bug inattendu, verrou SQLite...) fait tourner
 * l'UI indéfiniment, sans message d'erreur ni option de réessai. 35s,
 * légèrement au-dessus des 30s déjà utilisés côté backend pour ses propres
 * appels à GraphHopper/Nominatim (graphhopper_client.py, geocoding_client.py). */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Le serveur ne répond pas (délai dépassé).", { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** fetchWithTimeout() + vérification du statut + extraction du message
 * d'erreur, communes aux cinq modules d'API — trois variantes légèrement
 * différentes du même motif à 6 lignes existaient avant cette centralisation
 * (poi.js/saved-routes.js identiques, geocode.js/gpx.js sans la branche 204,
 * routing.js une troisième fois dans _postJson). */
export async function apiFetch(url, options = {}, fallbackMessage = "Erreur API") {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `${fallbackMessage} (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}
