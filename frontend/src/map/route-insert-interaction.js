import L from "leaflet";
import { isEventInside } from "./dom-utils.js";

const GHOST_STYLE = {
  radius: 6,
  color: "#fff",
  weight: 2,
  fillColor: "#1565c0",
  fillOpacity: 1,
  // Non interactif : sous le curseur en permanence, il provoquerait sinon des
  // mouseout/mouseover en boucle sur le tracé.
  interactive: false,
};

/**
 * Glisser-déposer sur le tracé affiché pour insérer une étape entre deux
 * waypoints existants (comme Google Maps ou Komoot). RouteLayer signale le
 * survol (hover/hoverEnd, poignée affichée sur le tracé) et le début du
 * glisser (startDrag, avec l'index du segment attrapé) ; au relâchement,
 * onInsert(segmentIndex, legBoundaries, lat, lon) est appelé, à charge pour
 * l'appelant d'en déduire la position d'insertion (voir
 * utils/itinerary.js::indexForRouteDrop). Échap, une interruption du geste
 * (pointercancel) ou un relâchement hors de la carte annulent.
 *
 * Pointer Events : un même chemin pour la souris, le doigt et le stylet —
 * les événements mousedown/mouseup ne se déclenchent pas au toucher.
 *
 * isEnabled() permet de suspendre l'interaction pendant un autre mode
 * "prochain clic sur la carte = …" (génération de boucle, dessin de zone) :
 * attraper le tracé ne doit alors pas insérer d'étape à la place.
 */
export class RouteInsertInteraction {
  constructor(map, onInsert, { isEnabled = () => true } = {}) {
    this._map = map;
    this._onInsert = onInsert;
    this._isEnabled = isEnabled;
    this._legBoundaries = [];
    this._ghost = null;
    this._dragging = false;
  }

  isEnabled() {
    return this._isEnabled();
  }

  setLegBoundaries(legBoundaries) {
    this._legBoundaries = legBoundaries ?? [];
  }

  hover(latlng) {
    if (this._dragging) return;
    this._showGhost(latlng);
  }

  hoverEnd() {
    if (this._dragging) return;
    this._removeGhost();
  }

  /** @param {PointerEvent} e pointerdown sur le tracé
   * @param {number} segmentIndex segment attrapé
   * @param {L.LatLng} latlng point du tracé sous le pointeur */
  startDrag(e, segmentIndex, latlng) {
    // Empêche le déplacement de la carte par Leaflet et les événements souris
    // de compatibilité qui suivraient le pointerdown.
    e.preventDefault();
    e.stopPropagation();
    this._dragging = true;
    this._map.dragging.disable();
    this._showGhost(latlng);
    const container = this._map.getContainer();
    const { pointerId } = e;

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      this._ghost?.setLatLng(this._map.mouseEventToLatLng(ev));
    };
    const finish = (ev) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKeyDown);
      this._dragging = false;
      this._map.dragging.enable();
      this._removeGhost();
      if (!ev) return;

      // L'appui (sur le tracé) et le relâchement (ailleurs) visent des
      // éléments différents : le navigateur émet alors un click sur leur
      // ancêtre commun, que Leaflet traiterait comme un clic carte et qui
      // ajouterait un second point. On l'absorbe, au plus tard jusqu'à la
      // fin de la tâche en cours.
      const swallowClick = (clickEvent) => clickEvent.stopPropagation();
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 0);

      if (!isEventInside(container, ev)) return;
      const { lat, lng } = this._map.mouseEventToLatLng(ev);
      this._onInsert(segmentIndex, this._legBoundaries, lat, lng);
    };
    // Écoute sur document plutôt que sur la carte : un relâchement hors de la
    // carte doit aussi terminer le glisser, sinon le déplacement de la carte
    // resterait désactivé. Filtré par pointerId : un second doigt ne perturbe
    // pas le geste en cours.
    const onUp = (ev) => {
      if (ev.pointerId === pointerId) finish(ev);
    };
    const onCancel = (ev) => {
      if (ev.pointerId === pointerId) finish(null);
    };
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") finish(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKeyDown);
  }

  _showGhost(latlng) {
    if (this._ghost) {
      this._ghost.setLatLng(latlng);
    } else {
      this._ghost = L.circleMarker(latlng, GHOST_STYLE).addTo(this._map);
    }
  }

  _removeGhost() {
    this._ghost?.remove();
    this._ghost = null;
  }
}
