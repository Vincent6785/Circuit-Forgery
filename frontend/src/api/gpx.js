import { fetchWithTimeout } from "./http.js";

export function exportGpxUrl(routeId) {
  return `/api/routes/${routeId}/export.gpx`;
}

export async function importGpx(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetchWithTimeout("/api/gpx/import", { method: "POST", body: formData });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Erreur API (${res.status})`);
  }
  return res.json();
}
