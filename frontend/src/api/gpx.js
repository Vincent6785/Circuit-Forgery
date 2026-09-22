import { ApiError, apiFetch, errorMessageFromDetail, fetchWithTimeout } from "./http.js";

/** @param {number} routeId */
export function exportGpxUrl(routeId) {
  return `/api/routes/${routeId}/export.gpx`;
}

/**
 * @param {File} file
 * @returns {Promise<{ waypoints: Array<{ lat: number, lon: number, label?: string | null }>, truncated: boolean }>}
 */
export async function importGpx(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/gpx/import", { method: "POST", body: formData });
}

/**
 * GPX du trajet courant, sauvegardé ou non.
 *
 * `charging_stops` : arrêts recharge du tracé courant, exportés en <wpt>
 * (repères) et non en <rtept> — ce ne sont pas des points du trajet.
 *
 * @param {{ name: string | null, waypoints: Array<{ lat: number, lon: number, label?: string | null }>, geometry_geojson: object, charging_stops?: Array<object> }} route
 * @returns {Promise<Blob>}
 */
export async function exportRouteGpx(route) {
  const res = await fetchWithTimeout("/api/gpx/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(errorMessageFromDetail(body?.detail, `Erreur d'export GPX (${res.status})`), res.status);
  }
  return res.blob();
}
