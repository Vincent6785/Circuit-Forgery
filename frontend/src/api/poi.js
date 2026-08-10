import { fetchWithTimeout } from "./http.js";

async function handle(res) {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Erreur API (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function listPOI() {
  return fetchWithTimeout("/api/poi").then(handle);
}

export function createPOI(poi) {
  return fetchWithTimeout("/api/poi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(poi),
  }).then(handle);
}

export function deletePOI(id) {
  return fetchWithTimeout(`/api/poi/${id}`, { method: "DELETE" }).then(handle);
}
