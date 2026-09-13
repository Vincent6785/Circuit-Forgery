import { createBusyTracker } from "../utils/busy-tracker.js";

// Délai avant d'afficher l'indicateur : une réponse rapide ne le fait pas
// apparaître puis disparaître aussitôt.
const SHOW_DELAY_MS = 250;

/** Indicateur "Calcul en cours…" du pied de sidebar. Renvoie trackBusy(promise),
 * à envelopper autour de toute opération réseau que l'utilisateur attend. */
export function initBusyIndicator() {
  const indicator = document.getElementById("route-busy");
  const routeInfo = document.getElementById("route-info");
  let showTimer;

  const tracker = createBusyTracker((busy) => {
    clearTimeout(showTimer);
    routeInfo.setAttribute("aria-busy", String(busy));
    if (busy) {
      showTimer = setTimeout(() => indicator.classList.remove("hidden"), SHOW_DELAY_MS);
    } else {
      indicator.classList.add("hidden");
    }
  });

  return (promise) => tracker.track(promise);
}
