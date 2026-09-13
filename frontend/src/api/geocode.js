// @ts-check
import { apiFetch } from "./http.js";

/**
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Array<{ label: string, lat: number, lon: number }>>}
 */
export function searchAddress(query, { signal } = {}) {
  return apiFetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal }, "Erreur de recherche d'adresse");
}
