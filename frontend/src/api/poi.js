import { apiFetch } from "./http.js";

export function listPOI() {
  return apiFetch("/api/poi");
}

export function createPOI(poi) {
  return apiFetch("/api/poi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(poi),
  });
}

export function deletePOI(id) {
  return apiFetch(`/api/poi/${id}`, { method: "DELETE" });
}
