export function showRouteInfo(distanceM, durationS) {
  const panel = document.getElementById("route-info");
  panel.classList.remove("hidden");
  document.getElementById("route-distance").textContent = `${(distanceM / 1000).toFixed(1)} km`;
  document.getElementById("route-duration").textContent = formatDuration(durationS);
}

export function hideRouteInfo() {
  document.getElementById("route-info").classList.add("hidden");
}

/** Bandeau générique (erreur ou information) réutilisant le même emplacement
 * inline — remplace les popups navigateur bloquantes (alert/confirm) pour les
 * messages non critiques. */
export function showBanner(message, { type = "error" } = {}) {
  const el = document.getElementById("route-error");
  el.textContent = message;
  el.classList.remove("hidden", "error", "info");
  el.classList.add(type);
}

export function hideBanner() {
  document.getElementById("route-error").classList.add("hidden");
}

export function showRouteError(message) {
  showBanner(message, { type: "error" });
}

export function hideRouteError() {
  hideBanner();
}

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
