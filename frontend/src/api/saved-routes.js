import { apiFetch } from "./http.js";

/** Liste allégée (sans points ni géométrie) : le détail d'un trajet n'est
 * chargé qu'à son ouverture, via getRoute. */
export function listRouteSummaries() {
  return apiFetch("/api/routes?view=summary");
}

export function getRoute(id) {
  return apiFetch(`/api/routes/${id}`);
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
