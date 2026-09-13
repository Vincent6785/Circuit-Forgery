// @ts-check
import { apiFetch } from "./http.js";

/**
 * @typedef {{ name: string, lat: number, lon: number, category?: string | null, notes?: string | null }} PoiInput
 * @typedef {PoiInput & { id: number, created_at: string }} Poi
 */

/**
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Poi[]>}
 */
export function listPOI({ signal } = {}) {
  return apiFetch("/api/poi", { signal });
}

/**
 * @param {PoiInput} poi
 * @returns {Promise<Poi>}
 */
export function createPOI(poi) {
  return apiFetch("/api/poi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(poi),
  });
}

/** @param {number} id */
export function deletePOI(id) {
  return apiFetch(`/api/poi/${id}`, { method: "DELETE" });
}

/**
 * Configuration d'affichage exposée par le backend (fond de carte).
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ tile_url: string, tile_attribution: string }>}
 */
export function getClientConfig({ signal } = {}) {
  return apiFetch("/api/config", { signal });
}
