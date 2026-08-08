import L from "leaflet";

const ZONE_COLOR = "#c62828";
const MIN_RADIUS_M = 20; // ignore les glissés quasi nuls (clic accidentel)

/** Mode togglable : une fois actif, glisser sur la carte définit une zone à
 * éviter (centre au mousedown, rayon = distance jusqu'au relâchement) — même
 * pattern de "ghost drag" que route-insert-interaction.js. Reste actif après
 * un tracé pour permettre d'en dessiner plusieurs à la suite ; seul un
 * nouveau clic sur le bouton de bascule désactive le mode.
 *
 * getPresetRadiusM (optionnel) : si un simple tap/clic sans glisser réel est
 * détecté (rayon < MIN_RADIUS_M) et que cette fonction retourne une valeur
 * positive, elle est utilisée comme rayon plutôt que d'ignorer l'interaction
 * — voie tactile/précise complémentaire au glisser (cf. plan). */
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
    if (!this._active) return;
    L.DomEvent.stop(e);
    this._map.dragging.disable();
    const center = e.latlng;

    this._ghost = L.circle(center, {
      radius: 1,
      color: ZONE_COLOR,
      weight: 2,
      fillColor: ZONE_COLOR,
      fillOpacity: 0.15,
    }).addTo(this._map);

    const onMove = (ev) => {
      this._ghost.setRadius(Math.max(center.distanceTo(ev.latlng), 1));
    };
    const onUp = (ev) => {
      this._map.off("mousemove", onMove);
      this._map.off("mouseup", onUp);
      this._map.dragging.enable();
      const radiusM = center.distanceTo(ev.latlng);
      this._ghost.remove();
      this._ghost = null;

      if (radiusM >= MIN_RADIUS_M) {
        this._onZoneDrawn(center.lat, center.lng, radiusM);
        return;
      }
      const preset = this._getPresetRadiusM?.();
      if (preset && preset > 0) {
        this._onZoneDrawn(center.lat, center.lng, preset);
      }
    };

    this._map.on("mousemove", onMove);
    this._map.on("mouseup", onUp);
  }
}
