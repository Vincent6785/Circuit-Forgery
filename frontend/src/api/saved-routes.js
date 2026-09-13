// @ts-check
import { apiFetch } from "./http.js";

/**
 * @typedef {object} RouteSummary
 * @property {number} id
 * @property {string} name
 * @property {string | null} [description]
 * @property {number} distance_m
 * @property {number} duration_s
 * @property {boolean} is_favorite
 * @property {string} created_at
 * @property {string | null} [updated_at]
 */

/** Liste allégée (sans points ni géométrie) : le détail d'un trajet n'est
 * chargé qu'à son ouverture, via getRoute.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<RouteSummary[]>} */
export function listRouteSummaries({ signal } = {}) {
  return apiFetch("/api/routes?view=summary", { signal });
}

/** @param {number} id */
export function getRoute(id) {
  return apiFetch(`/api/routes/${id}`);
}

/** @param {object} route */
export function createRoute(route) {
  return apiFetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });
}

/**
 * @param {number} id
 * @param {object} patch
 */
export function updateRoute(id, patch) {
  return apiFetch(`/api/routes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** @param {number} id */
export function deleteRoute(id) {
  return apiFetch(`/api/routes/${id}`, { method: "DELETE" });
}
