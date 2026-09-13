import { computeAlternatives } from "../api/routing.js";
import { createLatestRequest } from "../api/latest-request.js";
import { showRouteInfo, showRouteError, hideRouteError, formatDuration } from "./sidebar.js";

const DEFAULT_TITLE = "Uniquement pour un trajet à 2 points";
const AVOID_ZONE_TITLE =
  "Indisponible avec une zone à éviter active : GraphHopper ne calcule pas " +
  "d'itinéraires alternatifs sous une contrainte de zone (vérifié empiriquement).";
const SPEED_LIMIT_TITLE =
  "Indisponible avec une limite de vitesse personnalisée active : même " +
  "contrainte technique que pour une zone à éviter. \"Aucune limite\" reste " +
  "compatible (simple changement de profil, pas de contrainte par requête).";

/** Câble le bouton "Voir les alternatives" du panneau Trajet. Pertinent
 * uniquement pour un trajet à 2 waypoints (départ/arrivée) : c'est le seul
 * cas où GraphHopper calcule jusqu'à 3 tracés distincts pour le même point
 * A/B. Choisir une option remplace le tracé affiché (computedRoute) sans
 * toucher aux waypoints eux-mêmes.
 *
 * Désactivé plutôt que masqué dès qu'une zone à éviter ou un seuil de
 * vitesse personnalisé est actif : vérifié empiriquement que GraphHopper
 * ignore silencieusement `algorithm=alternative_route` en présence d'un
 * `custom_model`, et ne renvoie alors plus qu'un seul chemin — de vraies
 * alternatives sont donc impossibles sous cette contrainte, mieux vaut
 * l'expliquer que le cacher. "Aucune limite" reste compatible : c'est un
 * simple changement de profil, pas un custom_model par requête. */
export function initRouteAlternatives({ store, routeLayer, trackBusy = (promise) => promise }) {
  const btn = document.getElementById("show-alternatives-btn");
  const list = document.getElementById("alternatives-list");

  // "Dernier appel gagne" : changer les waypoints pendant que la requête est
  // en vol l'annule ; sans ça, les alternatives de l'ancienne paire
  // s'affichaient quand même, et en sélectionner une écrasait le tracé
  // courant avec une géométrie ne passant plus par les marqueurs.
  const request = createLatestRequest();

  function reset() {
    request.cancel();
    list.classList.add("hidden");
    list.innerHTML = "";
  }

  function buttonState(state) {
    const relevant = state.waypoints.length === 2;
    const blockedByAvoidZones = relevant && state.avoidZones.length > 0;
    const blockedBySpeedLimit = relevant && state.speedLimitKmh !== null;
    const title = blockedByAvoidZones ? AVOID_ZONE_TITLE : blockedBySpeedLimit ? SPEED_LIMIT_TITLE : DEFAULT_TITLE;
    return { relevant, blocked: blockedByAvoidZones || blockedBySpeedLimit, title };
  }

  let lastWaypoints = null;
  store.subscribe(
    (state) => {
    const { relevant, blocked, title } = buttonState(state);
    btn.classList.toggle("hidden", !relevant);
    btn.disabled = blocked;
    btn.title = title;
    // Les alternatives affichées ne valent que pour la paire de points pour
    // laquelle elles ont été calculées : déplacer A ou B (toujours deux
    // points) ou charger un autre trajet doit aussi les invalider, sans quoi
    // en choisir une dessinait un tracé ne passant plus par les marqueurs.
    const waypointsChanged = state.waypoints !== lastWaypoints;
    lastWaypoints = state.waypoints;
    if (!relevant || blocked || waypointsChanged) reset();
    },
    { keys: ["waypoints", "avoidZones", "speedLimitKmh"] }
  );

  btn.addEventListener("click", async () => {
    const { waypoints, noSpeedLimit } = store.getState();
    if (waypoints.length !== 2) return;
    btn.disabled = true;
    try {
      const outcome = await trackBusy(
        request.run((signal) =>
          computeAlternatives(
            waypoints.map((p) => ({ lat: p.lat, lon: p.lon })),
            noSpeedLimit,
            { signal }
          )
        )
      );
      if (outcome.stale) return;
      hideRouteError();
      _renderOptions(outcome.value.alternatives, store, routeLayer, list);
    } catch (err) {
      showRouteError(err.message);
    } finally {
      // Pas simplement false : une zone ou une limite ajoutée pendant la
      // requête doit laisser le bouton désactivé.
      btn.disabled = buttonState(store.getState()).blocked;
    }
  });
}

function _renderOptions(alternatives, store, routeLayer, list) {
  list.innerHTML = "";
  list.classList.remove("hidden");
  alternatives.forEach((alt, index) => {
    const li = document.createElement("li");
    // Un vrai bouton, atteignable au clavier (un <li> cliquable ne l'était pas).
    const option = document.createElement("button");
    option.type = "button";
    option.className = "list-item-label";
    option.textContent = `Option ${index + 1} — ${(alt.distance_m / 1000).toFixed(1)} km, ${formatDuration(alt.duration_s)}`;
    li.appendChild(option);
    option.addEventListener("click", () => {
      routeLayer.draw(alt.geometry_geojson, alt.max_speed_by_segment, alt.leg_boundaries);
      showRouteInfo(alt.distance_m, alt.duration_s);
      store.setState({ computedRoute: alt });
      [...list.children].forEach((c) => {
        c.classList.remove("selected");
        c.firstElementChild?.setAttribute("aria-pressed", "false");
      });
      li.classList.add("selected");
      option.setAttribute("aria-pressed", "true");
    });
    list.appendChild(li);
  });
}
