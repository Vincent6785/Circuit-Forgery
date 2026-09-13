import L from "leaflet";
import { isEventInside } from "./dom-utils.js";

const ZONE_COLOR = "#c62828";
const MIN_RADIUS_M = 20; // en dessous, on considère que c'est un clic accidentel plutôt qu'un vrai glissé

/** Mode togglable : une fois activé, glisser sur la carte définit une zone à
 * éviter (centre à l'appui, rayon égal à la distance jusqu'au relâchement) —
 * même pattern de "ghost drag" que route-insert-interaction.js. Le mode reste
 * actif après un premier tracé, pour permettre d'en dessiner plusieurs à la
 * suite ; seul un nouveau clic sur le bouton de bascule le désactive.
 *
 * getPresetRadiusM (optionnel) : quand le relâchement produit un rayon quasi
 * nul (tap/clic sans glisser réel, < MIN_RADIUS_M) et que cette fonction
 * renvoie une valeur positive, celle-ci est utilisée comme rayon au lieu
 * d'ignorer l'interaction — une voie tactile/précise en complément du
 * glisser.
 *
 * Pointer Events sur le conteneur de la carte : souris, doigt et stylet
 * (mousedown ne se déclenche pas au toucher). Un relâchement hors de la
 * carte, une interruption du geste (pointercancel) ou Échap annulent le
 * tracé. */
export class AvoidZoneDrawInteraction {
  constructor(map, onZoneDrawn, getPresetRadiusM) {
    this._map = map;
    this._onZoneDrawn = onZoneDrawn;
    this._getPresetRadiusM = getPresetRadiusM;
    this._active = false;
    this._ghost = null;
    /** Termine sans zone le tracé en cours ; null hors tracé. */
    this._cancelDrawing = null;

    map.getContainer().addEventListener("pointerdown", (e) => this._onPointerDown(e));
  }

  isActive() {
    return this._active;
  }

  toggle() {
    this._active = !this._active;
    const container = this._map.getContainer();
    container.style.cursor = this._active ? "crosshair" : "";
    // Au doigt, glisser dessine alors la zone au lieu de déplacer ou zoomer la carte.
    container.style.touchAction = this._active ? "none" : "";
    // Mode désactivé en plein glisser (changement d'onglet, options repliées) :
    // le relâchement ajoutait sinon quand même la zone.
    if (!this._active) this._cancelDrawing?.();
    return this._active;
  }

  _onPointerDown(e) {
    if (!this._active) return;
    // À la souris, bouton principal uniquement : le clic droit reste celui du
    // menu de création de point d'intérêt.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Les contrôles de la carte (zoom, attribution) gardent leur comportement.
    if (e.target instanceof Element && e.target.closest(".leaflet-control")) return;
    e.preventDefault();
    e.stopPropagation();
    // Un seul tracé à la fois : un second doigt posé pendant le glisser en
    // démarrait un autre, dont le cercle fantôme restait sur la carte et qui
    // ajoutait une seconde zone.
    if (this._cancelDrawing) return;
    this._map.dragging.disable();
    const center = this._map.mouseEventToLatLng(e);
    const container = this._map.getContainer();
    const { pointerId } = e;

    this._ghost = L.circle(center, {
      radius: 1,
      color: ZONE_COLOR,
      weight: 2,
      fillColor: ZONE_COLOR,
      fillOpacity: 0.15,
      interactive: false,
    }).addTo(this._map);

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      this._ghost?.setRadius(Math.max(center.distanceTo(this._map.mouseEventToLatLng(ev)), 1));
    };
    const finish = (ev) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKeyDown);
      this._cancelDrawing = null;
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
    this._cancelDrawing = () => finish(null);
  }
}
