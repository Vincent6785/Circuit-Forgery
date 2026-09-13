// Seuil appliqué par le profil GraphHopper par défaut (moto_no_fast) quand
// aucune limite personnalisée n'est choisie — voir speed-limit-controller.js.
const PROFILE_DEFAULT_KMH = 80;

/** Résumé d'une ligne des options actives, affiché sur le panneau replié
 * "Options du trajet" pour qu'une contrainte en cours reste visible sans
 * avoir à le déplier. */
export function routeOptionsSummary({ speedLimitKmh, noSpeedLimit, avoidZones }) {
  const parts = [noSpeedLimit ? "Sans limite" : `≤ ${speedLimitKmh ?? PROFILE_DEFAULT_KMH} km/h`];
  const zoneCount = avoidZones?.length ?? 0;
  if (zoneCount > 0) parts.push(`${zoneCount} zone${zoneCount > 1 ? "s" : ""} à éviter`);
  return parts.join(" · ");
}

export function initRouteOptionsSummary(store) {
  const el = document.getElementById("route-options-summary");
  function render(state) {
    const text = routeOptionsSummary(state);
    if (el.textContent !== text) el.textContent = text;
  }
  store.subscribe(render);
  render(store.getState());
}
