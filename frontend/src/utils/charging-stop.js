// @ts-check

/**
 * Lignes de description d'un arrêt recharge : adresse, caractéristiques de la
 * borne, position sur le trajet. Partagées par la popup de la carte
 * (map/charging-stop-layer.js) et testables sans DOM ni Leaflet.
 *
 * Tout est optionnel dans la source IRVE : une ligne sans valeur est omise
 * plutôt qu'affichée vide.
 *
 * @param {Record<string, any>} stop
 * @returns {string[]}
 */
export function chargingStopLines(stop) {
  const lines = [];
  if (stop.address) lines.push(stop.address);

  const specs = [];
  if (stop.power_kw) specs.push(`${stop.power_kw} kW`);
  if (stop.point_count > 1) specs.push(`${stop.point_count} points de charge`);
  if (stop.two_wheeler) specs.push("deux-roues");
  if (specs.length > 0) lines.push(specs.join(" · "));

  lines.push(`À ${(stop.route_distance_m / 1000).toFixed(1)} km du départ`);
  // Sous 100 m, l'écart relève de l'accrochage au réseau routier, pas d'un
  // détour que l'utilisateur ressentira.
  if (stop.detour_m >= 100) lines.push(`${Math.round(stop.detour_m)} m d'écart au tracé direct`);
  return lines;
}
