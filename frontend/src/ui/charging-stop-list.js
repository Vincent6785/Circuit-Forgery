import { renderListPanel, listItemButton } from "./list-panel.js";
import { formatDuration } from "./sidebar.js";

/** Liste des arrêts recharge du trajet courant, et résumé au-dessus.
 * Cliquer un arrêt recentre la carte dessus (onSelect).
 *
 * @param {Array<Record<string, any>>} stops
 * @param {{ chargingDurationS: number, unplaced: number, unavailable: boolean, maxGapM: number | null, intervalKm: number }} summary
 * @param {(index: number) => void} onSelect
 */
export function renderChargingStopList(stops, summary, onSelect) {
  document.getElementById("charging-summary").textContent = chargingSummaryText(stops.length, summary);
  return renderListPanel("charging-stop-list", stops, {
    renderLabel: (stop, index) =>
      listItemButton(
        `${index + 1}. ${(stop.route_distance_m / 1000).toFixed(1)} km — ${stop.name}`,
        { title: stop.address || stop.name, onClick: () => onSelect(index) }
      ),
    renderActions: (stop) => [_durationTag(stop)],
  });
}

function _durationTag(stop) {
  const span = document.createElement("span");
  span.className = "charging-duration";
  span.textContent = formatDuration(stop.charge_duration_s);
  span.title = `${Math.round(stop.charge_percent)} % de batterie à regagner`;
  return span;
}

/** Résumé affiché au-dessus de la liste. Exposé pour être testé sans DOM.
 *
 * @param {number} stopCount
 * @param {{ chargingDurationS: number, unplaced: number, unavailable: boolean, maxGapM: number | null, intervalKm: number }} summary
 */
export function chargingSummaryText(stopCount, { chargingDurationS, unplaced, unavailable, maxGapM, intervalKm }) {
  if (unavailable) {
    return "Bornes indisponibles : la base nationale IRVE (data.gouv.fr) n'a pas pu être interrogée. Le trajet est affiché sans arrêt recharge.";
  }
  const parts = [];
  if (stopCount === 0) {
    parts.push("Aucun arrêt recharge nécessaire sur ce trajet.");
  } else {
    parts.push(
      `${stopCount} arrêt${stopCount > 1 ? "s" : ""} — ${formatDuration(chargingDurationS)} de recharge au total.`
    );
  }
  if (unplaced > 0) {
    parts.push(
      `${unplaced} recharge${unplaced > 1 ? "s" : ""} sans borne à proximité : l'autonomie n'est pas garantie sur ${unplaced > 1 ? "ces tronçons" : "ce tronçon"}.`
    );
  }
  // Chaque détour par une borne rallonge le trajet, donc écarte les recharges
  // suivantes : le dire plutôt que laisser croire que l'intervalle demandé
  // est tenu au mètre près.
  if (stopCount > 0 && maxGapM != null && maxGapM > intervalKm * 1000 * 1.05) {
    parts.push(`Plus long tronçon sans recharge : ${(maxGapM / 1000).toFixed(1)} km.`);
  }
  return parts.join(" ");
}
