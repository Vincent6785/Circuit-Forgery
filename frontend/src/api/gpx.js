import { apiFetch } from "./http.js";

export function exportGpxUrl(routeId) {
  return `/api/routes/${routeId}/export.gpx`;
}

export async function importGpx(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/gpx/import", { method: "POST", body: formData });
}
