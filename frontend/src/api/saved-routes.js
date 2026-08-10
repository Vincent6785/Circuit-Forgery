import { apiFetch } from "./http.js";

export function listRoutes() {
  return apiFetch("/api/routes");
}

export function createRoute(route) {
  return apiFetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });
}

export function updateRoute(id, patch) {
  return apiFetch(`/api/routes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteRoute(id) {
  return apiFetch(`/api/routes/${id}`, { method: "DELETE" });
}
