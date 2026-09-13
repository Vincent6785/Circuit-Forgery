import { AvoidZoneLayer } from "../map/avoid-zone-layer.js";
import { AvoidZoneDrawInteraction } from "../map/avoid-zone-draw-interaction.js";
import { renderAvoidZoneList } from "../ui/avoid-zone-list.js";
import { TAB_CHANGE_EVENT } from "../ui/tabs.js";


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
    store.setState({ avoidZones: zones }, { userChange: true });
  }

  function removeZoneAt(index) {
    pushHistory();
    const zones = store.getState().avoidZones.filter((_, i) => i !== index);
    store.setState({ avoidZones: zones }, { userChange: true });
  }

  // Uniquement quand les zones changent : reconstruire les cercles à chaque
  // mise à jour (fin d'un calcul, par exemple) fermait leur popup ouvert.
  store.subscribe(
    (state) => {
      layer.render(state.avoidZones);
      renderAvoidZoneList(state.avoidZones, removeZoneAt);
      document.getElementById("avoid-zone-list-panel").classList.toggle("hidden", state.avoidZones.length === 0);
    },
    { keys: ["avoidZones"] }
  );

  const drawInteraction = new AvoidZoneDrawInteraction(map, addZone, () => {
    const v = parseFloat(radiusInput.value);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  function setDrawing(active) {
    if (drawInteraction.isActive() === active) return;
    drawInteraction.toggle();
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
    // Libellé constant : l'état est porté par aria-pressed (un libellé qui
    // change en plus était annoncé deux fois) et par l'indication visible.
    document.getElementById("avoid-zone-draw-hint").classList.toggle("hidden", !active);
    toggleBtn.classList.toggle("active", active);
    toggleBtn.setAttribute("aria-pressed", String(active));
  }

  toggleBtn.addEventListener("click", () => setDrawing(!drawInteraction.isActive()));

  // Le mode dessin ne doit pas rester actif hors de vue : panneau d'options
  // replié ou onglet sans carte éditable.
  document.getElementById("route-options").addEventListener("toggle", (e) => {
    if (!e.currentTarget.open) setDrawing(false);
  });
  document.addEventListener(TAB_CHANGE_EVENT, (e) => {
    if (e.detail.tab === "saved") setDrawing(false);
  });
}
