import L from "leaflet";
import { isEventInside } from "./dom-utils.js";

const ZONE_COLOR = "#c62828";
const MIN_RADIUS_M = 20; // en dessous, on considère que c'est un clic accidentel plutôt qu'un vrai glissé

/** Mode togglable : une fois activé, glisser sur la carte définit une zone à
 * éviter (centre au mousedown, rayon égal à la distance jusqu'au
 * relâchement) — même pattern de "ghost drag" que route-insert-interaction.js.
 * Le mode reste actif après un premier tracé, pour permettre d'en dessiner
 * plusieurs à la suite ; seul un nouveau clic sur le bouton de bascule le
 * désactive.
 *
 * getPresetRadiusM (optionnel) : quand le relâchement produit un rayon quasi
 * nul (tap/clic sans glisser réel, < MIN_RADIUS_M) et que cette fonction
 * renvoie une valeur positive, celle-ci est utilisée comme rayon au lieu
 * d'ignorer l'interaction — une voie tactile/précise en complément du
 * glisser.
 *
 * Un relâchement hors de la carte ou Échap annulent le tracé. */
export class AvoidZoneDrawInteraction {
  constructor(map, onZoneDrawn, getPresetRadiusM) {
    this._map = map;
    this._onZoneDrawn = onZoneDrawn;
    this._getPresetRadiusM = getPresetRadiusM;
    this._active = false;
    this._ghost = null;

    map.on("mousedown", (e) => this._onMouseDown(e));
  }

  isActive() {
    return this._active;
  }

  toggle() {
    this._active = !this._active;
    this._map.getContainer().style.cursor = this._active ? "crosshair" : "";
    return this._active;
  }

  _onMouseDown(e) {
    // Bouton principal uniquement : le clic droit reste celui du menu de
    // création de point d'intérêt.
    if (!this._active || e.originalEvent?.button !== 0) return;
    L.DomEvent.stop(e);
    this._map.dragging.disable();
    const center = e.latlng;
    const container = this._map.getContainer();

    this._ghost = L.circle(center, {
      radius: 1,
      color: ZONE_COLOR,
      weight: 2,
      fillColor: ZONE_COLOR,
      fillOpacity: 0.15,
      interactive: false,
    }).addTo(this._map);

    const onMove = (ev) => {
      this._ghost?.setRadius(Math.max(center.distanceTo(this._map.mouseEventToLatLng(ev)), 1));
    };
    const finish = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKeyDown);
      this._map.dragging.enable();
      this._ghost?.remove();
      this._ghost = null;
      if (!ev || !isEventInside(container, ev)) return;

      const radiusM = center.distanceTo(this._map.mouseEventToLatLng(ev));
      if (radiusM >= MIN_RADIUS_M) {
        this._onZoneDrawn(center.lat, center.lng, radiusM);
        return;
      }
      const preset = this._getPresetRadiusM?.();
      if (preset && preset > 0) {
        this._onZoneDrawn(center.lat, center.lng, preset);
      }
    };
    // Écoute sur document plutôt que sur la carte : un relâchement hors de la
    // carte doit aussi terminer le tracé, sinon le déplacement de la carte
    // restait désactivé et le cercle fantôme affiché.
    const onUp = (ev) => finish(ev);
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") finish(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKeyDown);
  }
}
