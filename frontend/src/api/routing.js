// @ts-check
import { apiFetch } from "./http.js";

/**
 * @typedef {{ lat: number, lon: number, label?: string | null }} WaypointInput
 * @typedef {{ lat: number, lon: number, radiusM: number }} AvoidZone
 * @typedef {{ lat: number, lon: number, radius_m: number }} ApiAvoidZone
 *
 * @typedef {object} ComputeRouteResponse
 * @property {number} distance_m
 * @property {number} duration_s
 * @property {{ type: "LineString", coordinates: number[][] }} geometry_geojson
 * @property {(number | null)[]} [max_speed_by_segment]
 * @property {(string | null)[]} [road_class_by_segment]
 * @property {number[]} [leg_boundaries]
 * @property {number[]} [cumulative_distance_m]
 * @property {WaypointInput[]} [waypoints]
 * @property {boolean} [simplified]
 */

/**
 * @param {string} url
 * @param {unknown} body
 * @param {string} fallbackMessage
 * @param {AbortSignal} [signal]
 */
function _postJson(url, body, fallbackMessage, signal) {
  return apiFetch(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal },
    fallbackMessage
  );
}

/** Passe une zone du format JS ({lat, lon, radiusM}) au format attendu par
 * l'API ({lat, lon, radius_m}).
 * @param {AvoidZone[]} zones
 * @returns {ApiAvoidZone[]} */
export function toApiAvoidZones(zones) {
  return zones.map((z) => ({ lat: z.lat, lon: z.lon, radius_m: z.radiusM }));
}

/** Sens inverse, pour recharger les zones d'un trajet sauvegardé.
 * @param {ApiAvoidZone[] | null | undefined} zones
 * @returns {AvoidZone[]} */
export function fromApiAvoidZones(zones) {
  return (zones || []).map((z) => ({ lat: z.lat, lon: z.lon, radiusM: z.radius_m }));
}

/**
 * @param {WaypointInput[]} waypoints
 * @param {AvoidZone[]} [avoidZones]
 * @param {number | null} [speedLimitKmh]
 * @param {boolean} [noSpeedLimit]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<ComputeRouteResponse>}
 */
export function computeRoute(waypoints, avoidZones = [], speedLimitKmh = null, noSpeedLimit = false, { signal } = {}) {
  return _postJson(
    "/api/routes/compute",
    {
      waypoints,
      avoid_zones: toApiAvoidZones(avoidZones),
      speed_limit_kmh: speedLimitKmh,
      no_speed_limit: noSpeedLimit,
    },
    "Erreur de calcul d'itinéraire",
    signal
  );
}

/**
 * @param {{ lat: number, lon: number }} start
 * @param {number} distanceM
 * @param {number | undefined} seed
 * @param {AvoidZone[]} [avoidZones]
 * @param {number | null} [speedLimitKmh]
 * @param {boolean} [noSpeedLimit]
 * @param {WaypointInput[]} [viaPoints] Points que le circuit doit traverser ;
 *   le backend les insère dans les waypoints renvoyés (ils ne peuvent pas
 *   être imposés à l'algorithme round_trip lui-même).
 * @returns {Promise<ComputeRouteResponse>}
 */
export function computeRoundTrip(
  start,
  distanceM,
  seed,
  avoidZones = [],
  speedLimitKmh = null,
  noSpeedLimit = false,
  viaPoints = []
) {
  return _postJson(
    "/api/routes/round-trip",
    {
      start,
      distance_m: distanceM,
      seed,
      via_points: viaPoints.map((p) => ({ lat: p.lat, lon: p.lon })),
      avoid_zones: toApiAvoidZones(avoidZones),
      speed_limit_kmh: speedLimitKmh,
      no_speed_limit: noSpeedLimit,
    },
    "Erreur de génération du circuit"
  );
}

/**
 * @param {WaypointInput[]} waypoints
 * @param {boolean} [noSpeedLimit]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ alternatives: ComputeRouteResponse[] }>}
 */
export function computeAlternatives(waypoints, noSpeedLimit = false, { signal } = {}) {
  return _postJson(
    "/api/routes/alternatives",
    { waypoints, no_speed_limit: noSpeedLimit },
    "Erreur de calcul des itinéraires alternatifs",
    signal
  );
}
