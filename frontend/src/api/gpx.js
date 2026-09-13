import { apiFetch } from "./http.js";

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
