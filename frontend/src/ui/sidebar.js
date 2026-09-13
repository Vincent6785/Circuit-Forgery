export function showRouteInfo(distanceM, durationS) {
  const panel = document.getElementById("route-info");
  panel.classList.remove("hidden");
  document.getElementById("route-distance").textContent = `${(distanceM / 1000).toFixed(1)} km`;
  document.getElementById("route-duration").textContent = formatDuration(durationS);
}

export function hideRouteInfo() {
  document.getElementById("route-info").classList.add("hidden");
}

/** Bandeau générique (erreur ou information) qui réutilise le même
 * emplacement inline, à la place des popups navigateur bloquantes
 * (alert/confirm) pour les messages non critiques. Une erreur est annoncée
 * immédiatement par les lecteurs d'écran (role="alert") ; une information,
 * sans interrompre (role="status"). */
export function showBanner(message, { type = "error" } = {}) {
  const el = document.getElementById("route-error");
  el.textContent = message;
  el.setAttribute("role", type === "error" ? "alert" : "status");
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

/** Arrondi à la minute avant de séparer heures et minutes : arrondir après
 * le modulo affichait "1 h 60 min" pour 1 h 59 min 45 s. */
export function formatDuration(seconds) {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
