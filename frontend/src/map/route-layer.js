import L from "leaflet";
import { groupRunsByColor, nearestSegment } from "../utils/route-segments.js";

const LINE_STYLE = { weight: 5, opacity: 0.85, interactive: false };
// Zone sensible au survol, plus large que le trait visible pour qu'il soit
// facile à attraper à la souris.
const HIT_WEIGHT = 18;
const INSERT_HINT = "Glisser pour ajouter une étape";

export class RouteLayer {
  constructor(map, insertInteraction = null) {
    this._map = map;
    this._insertInteraction = insertInteraction;
    this._group = L.layerGroup().addTo(map);
    this._hitLine = null;
    this._coords = [];
    this._speeds = [];
    // Coordonnées du tracé projetées en pixels "layer", calculées à la
    // demande au premier survol : elles ne changent pas lors d'un
    // déplacement de la carte, seulement au changement de zoom.
    this._projected = null;
    this._tooltipEl = document.createElement("span");
    this._pendingLatLng = null;
    this._frame = null;

    map.on("zoomend viewreset", () => {
      this._projected = null;
    });
  }

  clear() {
    this._cancelHoverFrame();
    this._insertInteraction?.hoverEnd();
    this._group.clearLayers();
    this._hitLine = null;
    this._coords = [];
    this._speeds = [];
    this._projected = null;
  }

  /**
   * geometry_geojson : { type: "LineString", coordinates: [[lon, lat], ...] }
   * maxSpeedBySegment : max_speed (ou null) pour chaque segment du tracé
   * legBoundaries : index de chaque waypoint demandé dans coordinates (voir
   *   backend/app/services/route_enrichment.py) — sert à insertInteraction
   *   pour déterminer entre quels deux waypoints insérer un point glissé.
   *
   * Une polyline par tronçon de même couleur, plus une seule polyline
   * transparente qui porte survol, infobulle et insertion : le nombre de
   * couches ne dépend plus de la longueur du trajet.
   */
  draw(geometryGeojson, maxSpeedBySegment, legBoundaries = []) {
    this.clear();
    const coords = geometryGeojson?.coordinates ?? [];
    this._insertInteraction?.setLegBoundaries(legBoundaries);
    if (coords.length < 2) return;
    this._coords = coords;
    this._speeds = maxSpeedBySegment ?? [];

    for (const run of groupRunsByColor(coords, this._speeds)) {
      L.polyline(run.latlngs, { ...LINE_STYLE, color: run.color }).addTo(this._group);
    }

    const hitLine = L.polyline(
      coords.map(([lon, lat]) => [lat, lon]),
      { weight: HIT_WEIGHT, opacity: 0, className: "route-hit" }
    ).addTo(this._group);
    this._tooltipEl.textContent = INSERT_HINT;
    hitLine.bindTooltip(this._tooltipEl, { sticky: true, direction: "top", offset: [0, -10] });
    hitLine.on("mousemove", (e) => this._scheduleHover(e.latlng));
    hitLine.on("mouseout", () => {
      this._cancelHoverFrame();
      this._insertInteraction?.hoverEnd();
    });
    // Pointer Events plutôt que l'événement "mousedown" de Leaflet : un même
    // chemin pour la souris, le doigt et le stylet (mousedown ne se déclenche
    // pas au toucher).
    hitLine.getElement()?.addEventListener("pointerdown", (ev) => this._onPointerDown(ev));
    this._hitLine = hitLine;

    this._map.fitBounds(hitLine.getBounds(), { padding: [30, 30] });
  }

  /** Segment du tracé le plus proche d'une position, et le point
   * correspondant sur le tracé. */
  _nearestAt(latlng) {
    if (!this._projected) {
      this._projected = this._coords.map(([lon, lat]) => this._map.latLngToLayerPoint([lat, lon]));
    }
    const nearest = nearestSegment(this._projected, this._map.latLngToLayerPoint(latlng));
    if (!nearest) return null;
    return { segmentIndex: nearest.index, latlng: this._map.layerPointToLatLng([nearest.x, nearest.y]) };
  }

  /** Limité à un calcul par frame : mousemove peut se déclencher bien plus
   * souvent que l'écran ne se rafraîchit. */
  _scheduleHover(latlng) {
    this._pendingLatLng = latlng;
    if (this._frame !== null) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      const nearest = this._hitLine && this._nearestAt(this._pendingLatLng);
      if (!nearest) return;
      const speed = this._speeds[nearest.segmentIndex];
      const text = speed != null ? `${Math.round(speed)} km/h · ${INSERT_HINT.toLowerCase()}` : INSERT_HINT;
      if (this._tooltipEl.textContent !== text) this._tooltipEl.textContent = text;
      if (this._insertInteraction?.isEnabled()) {
        this._insertInteraction.hover(nearest.latlng);
      } else {
        this._insertInteraction?.hoverEnd();
      }
    });
  }

  _cancelHoverFrame() {
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
  }

  _onPointerDown(ev) {
    // Hors mode d'insertion (génération de boucle, dessin de zone), l'événement
    // suit son cours vers la carte. À la souris, bouton principal uniquement :
    // un clic droit sur le tracé ouvre le menu de création de point d'intérêt.
    if (!this._insertInteraction?.isEnabled()) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const nearest = this._nearestAt(this._map.mouseEventToLatLng(ev));
    if (!nearest) return;
    this._cancelHoverFrame();
    this._hitLine.closeTooltip();
    this._insertInteraction.startDrag(ev, nearest.segmentIndex, nearest.latlng);
  }
}
