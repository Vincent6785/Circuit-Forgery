import { AvoidZoneLayer } from "../map/avoid-zone-layer.js";
import { AvoidZoneDrawInteraction } from "../map/avoid-zone-draw-interaction.js";
import { renderAvoidZoneList } from "../ui/avoid-zone-list.js";

const TOGGLE_LABEL_OFF = "🚫 Éviter une zone";
const TOGGLE_LABEL_ON = "🚫 Glisser sur la carte pour dessiner…";

/** Câble la sidebar "Zones à éviter" : dessin au glisser sur la carte,
 * calque, liste, et synchronisation avec le store (avoidZones) pour que
 * route-controller.js en tienne compte au recalcul du trajet. */
export function initAvoidZoneController({ map, store, waypointManager, history }) {
  const layer = new AvoidZoneLayer(map, (index) => removeZoneAt(index));
  const toggleBtn = document.getElementById("avoid-zone-toggle-btn");
  const radiusInput = document.getElementById("avoid-zone-radius-input");

  // Partage l'historique des waypoints (state/history.js, voir markers.js) :
  // chaque mutation de zone archive un snapshot combiné {waypoints,
  // avoidZones} avant de toucher au store, pour que Ctrl+Z l'annule au même
  // titre qu'une mutation de waypoint.
  function pushHistory() {
    history.push({ waypoints: waypointManager.getPoints(), avoidZones: store.getState().avoidZones });
  }

  function addZone(lat, lon, radiusM) {
    pushHistory();
    const zones = [...store.getState().avoidZones, { lat, lon, radiusM }];
    store.setState({ avoidZones: zones }, { silent: false });
  }

  function removeZoneAt(index) {
    pushHistory();
    const zones = store.getState().avoidZones.filter((_, i) => i !== index);
    store.setState({ avoidZones: zones }, { silent: false });
  }

  store.subscribe((state) => {
    layer.render(state.avoidZones);
    renderAvoidZoneList(state.avoidZones, removeZoneAt);
    document.getElementById("avoid-zone-list-panel").classList.toggle("hidden", state.avoidZones.length === 0);
  });

  const drawInteraction = new AvoidZoneDrawInteraction(map, addZone, () => {
    const v = parseFloat(radiusInput.value);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  toggleBtn.addEventListener("click", () => {
    const active = drawInteraction.toggle();
    // L.DomEvent.stop() sur le mousedown du dessin ne suffit pas ici à
    // empêcher l'ajout normal d'un waypoint. Différence avec
    // route-insert-interaction.js, qui s'attache au mousedown d'une *couche*
    // et intercepte donc l'événement avant qu'il ne remonte au niveau carte :
    // ce contrôleur écoute directement map.on("mousedown", ...), où la
    // détection de clic interne de Leaflet — liée au DOM natif dès la
    // création de la carte — a déjà traité l'événement avant notre handler
    // (vérifié empiriquement : un waypoint s'ajoutait en plus de la zone).
    // Même parade que pour le mode "génération de circuit" : désactiver
    // l'ajout au clic tant que le mode dessin est actif.
    waypointManager.setAddOnMapClickEnabled(!active);
    toggleBtn.textContent = active ? TOGGLE_LABEL_ON : TOGGLE_LABEL_OFF;
    toggleBtn.classList.toggle("active", active);
  });
}
