import { computeAlternatives } from "../api/routing.js";
import { showRouteInfo, showRouteError, hideRouteError, formatDuration } from "./sidebar.js";

const DEFAULT_TITLE = "Uniquement pour un trajet à 2 points";
const AVOID_ZONE_TITLE =
  "Indisponible avec une zone à éviter active : GraphHopper ne calcule pas " +
  "d'itinéraires alternatifs sous une contrainte de zone (vérifié empiriquement).";

/** Câble le bouton "Voir les alternatives" du panneau Trajet : uniquement
 * pertinent pour un trajet à 2 waypoints (départ/arrivée) — GraphHopper
 * calcule alors jusqu'à 3 tracés distincts pour le même point A/B. Choisir
 * une option remplace le tracé affiché (computedRoute) sans changer les
 * waypoints eux-mêmes.
 *
 * Désactivé (pas masqué) dès qu'une zone à éviter est active : vérifié
 * empiriquement que GraphHopper ignore silencieusement
 * `algorithm=alternative_route` en présence d'un `custom_model` (toujours
 * un seul chemin renvoyé) — impossible de proposer de vraies alternatives
 * sous cette contrainte, mieux vaut l'expliquer que le cacher. */
export function initRouteAlternatives({ store, routeLayer }) {
  const btn = document.getElementById("show-alternatives-btn");
  const list = document.getElementById("alternatives-list");

  function reset() {
    list.classList.add("hidden");
    list.innerHTML = "";
  }

  store.subscribe((state) => {
    const relevant = state.waypoints.length === 2;
    const blockedByAvoidZones = relevant && state.avoidZones.length > 0;
    btn.classList.toggle("hidden", !relevant);
    btn.disabled = blockedByAvoidZones;
    btn.title = blockedByAvoidZones ? AVOID_ZONE_TITLE : DEFAULT_TITLE;
    if (!relevant || blockedByAvoidZones) reset();
  });

  btn.addEventListener("click", async () => {
    const { waypoints } = store.getState();
    if (waypoints.length !== 2) return;
    btn.disabled = true;
    try {
      const { alternatives } = await computeAlternatives(waypoints.map((p) => ({ lat: p.lat, lon: p.lon })));
      hideRouteError();
      _renderOptions(alternatives, store, routeLayer, list);
    } catch (err) {
      showRouteError(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function _renderOptions(alternatives, store, routeLayer, list) {
  list.innerHTML = "";
  list.classList.remove("hidden");
  alternatives.forEach((alt, index) => {
    const li = document.createElement("li");
    li.textContent = `Option ${index + 1} — ${(alt.distance_m / 1000).toFixed(1)} km, ${formatDuration(alt.duration_s)}`;
    li.addEventListener("click", () => {
      routeLayer.draw(alt.geometry_geojson, alt.max_speed_by_segment, alt.leg_boundaries);
      showRouteInfo(alt.distance_m, alt.duration_s);
      store.setState({ computedRoute: alt }, { silent: true });
      [...list.children].forEach((c) => c.classList.remove("selected"));
      li.classList.add("selected");
    });
    list.appendChild(li);
  });
}
