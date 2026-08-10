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
