import L from "leaflet";
import { roleForIndex } from "./waypoint-role.js";
import { buildDivIcon } from "./icon-utils.js";
import { indexForNewPoint } from "../utils/itinerary.js";
import { normalizeIds } from "../utils/waypoint-ids.js";

const PIN_SIZE = 26;
const MARKER_HINT = "glisser pour déplacer · clic droit pour supprimer";

/** Épingle ronde avec badge ("A", "B" ou numéro d'étape). color et badge
 * viennent de roleForIndex (constantes et position dans le trajet), jamais
 * d'un libellé saisi : leur injection dans le HTML de l'icône est sûre. */
function pinIcon(color, badge, selected) {
  return buildDivIcon(
    `<div class="wp-pin${selected ? " selected" : ""}" style="--pin-color:${color}">${badge}</div>`,
    { size: [PIN_SIZE, PIN_SIZE], anchor: [PIN_SIZE / 2, PIN_SIZE / 2] }
  );
}

function iconKeyFor(color, badge, selected) {
  return `${color}|${badge}|${selected}`;
}

let _nextId = 1;
function newId() {
  return _nextId++;
}

/**
 * Gère les waypoints d'un trajet : marqueurs sur la carte, et état reflété
 * dans le store (clé "waypoints"). Chaque mutation utilisateur (ajout,
 * suppression, déplacement, réorganisation) notifie le store en mode
 * comme changement utilisateur (userChange), ce qui déclenche recalcul et
 * autosave chez les abonnés ; setPointsSilently — aperçu d'un trajet
 * sauvegardé, restauration de brouillon — notifie au contraire sans ce drapeau.
 *
 * L'historique undo/redo (state/history.js) est partagé avec les zones à
 * éviter : controllers/avoid-zone-controller.js y pousse aussi ses propres
 * snapshots, si bien que Ctrl+Z annule la dernière mutation quelle que soit
 * sa source, waypoint ou zone.
 */
export class WaypointManager {
  constructor(map, store, history) {
    this._map = map;
    this._store = store;
    this._history = history;
    this._points = []; // liste de {id, lat, lon, label}
    // Marqueurs alignés sur _points (même index). Chaque entrée garde l'état
    // déjà appliqué au marqueur, pour ne toucher au DOM que si nécessaire.
    this._markers = []; // liste de {marker, iconKey, tooltipEl}
    this._selectedId = null;
    this._addOnMapClick = true;

    map.on("click", (e) => {
      if (!this._addOnMapClick) return;
      this.addPointSmart(e.latlng.lat, e.latlng.lng, { append: e.originalEvent?.shiftKey === true });
    });

    document.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

      if ((e.ctrlKey || e.metaKey) && !isTyping) {
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          this.undo();
          return;
        }
        if ((key === "z" && e.shiftKey) || key === "y") {
          e.preventDefault();
          this.redo();
          return;
        }
      }

      if (this._selectedId === null) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isTyping) return;
      e.preventDefault();
      this.removePoint(this._selectedId);
    });
  }

  _snapshot() {
    return this._points.map((p) => ({ ...p }));
  }

  /** Snapshot combiné waypoints + zones à éviter, dans le format attendu par
   * l'historique commun (state/history.js). */
  _fullSnapshot() {
    return { waypoints: this._snapshot(), avoidZones: this._store.getState().avoidZones };
  }

  /** À appeler par toute mutation utilisateur avant de toucher à _points :
   * archive l'état courant (waypoints + zones à éviter) pour un futur undo(),
   * et invalide la pile redo — une nouvelle mutation rend l'historique
   * "futur" obsolète, comportement standard d'un undo/redo. */
  _pushHistory() {
    this._history.push(this._fullSnapshot());
  }

  /** Applique un snapshot restauré et notifie waypoints + avoidZones en une
   * seule fois — un seul recalcul, avec les deux à jour ensemble plutôt que
   * l'un après l'autre. */
  _applySnapshot(snapshot) {
    this._points = snapshot.waypoints;
    this._selectedId = null;
    this._render();
    this._store.setState({ waypoints: this.getPoints(), avoidZones: snapshot.avoidZones }, { userChange: true });
  }

  undo() {
    const snapshot = this._history.undo(this._fullSnapshot());
    if (!snapshot) return;
    this._applySnapshot(snapshot);
  }

  redo() {
    const snapshot = this._history.redo(this._fullSnapshot());
    if (!snapshot) return;
    this._applySnapshot(snapshot);
  }

  canUndo() {
    return this._history.canUndo();
  }

  canRedo() {
    return this._history.canRedo();
  }

  /** Ajout en fin de trajet : le point devient la nouvelle arrivée. */
  addPoint(lat, lon, label = null) {
    this.insertPointAt(this._points.length, lat, lon, label);
  }

  /** Ajout depuis un clic carte : départ, puis arrivée, puis étapes insérées
   * là où elles allongent le moins le trajet, l'arrivée restant l'arrivée
   * (voir utils/itinerary.js). append force l'ajout en fin (Maj + clic). */
  addPointSmart(lat, lon, { append = false, label = null } = {}) {
    this.insertPointAt(indexForNewPoint(this._points, { lat, lon }, { append }), lat, lon, label);
  }

  insertPointAt(index, lat, lon, label = null) {
    this._pushHistory();
    const clamped = Math.max(0, Math.min(index, this._points.length));
    this._points.splice(clamped, 0, { id: newId(), lat, lon, label });
    this._selectedId = null;
    this._render();
    this._notify(true);
  }

  removePoint(id) {
    this._pushHistory();
    this._points = this._points.filter((p) => p.id !== id);
    if (this._selectedId === id) this._selectedId = null;
    this._render();
    this._notify(true);
  }

  updatePoint(id, lat, lon) {
    const point = this._points.find((p) => p.id === id);
    if (!point) return;
    this._pushHistory();
    point.lat = lat;
    point.lon = lon;
    this._render();
    this._notify(true);
  }

  renamePoint(id, label) {
    this.editPoint(id, { label });
  }

  /** Modifie lat/lon/label en une seule notification, pour éviter un double
   * recalcul quand ui/waypoint-list.js change plusieurs champs à la fois. */
  editPoint(id, { lat, lon, label } = {}) {
    const point = this._points.find((p) => p.id === id);
    if (!point) return;
    this._pushHistory();
    if (lat !== undefined) point.lat = lat;
    if (lon !== undefined) point.lon = lon;
    if (label !== undefined) point.label = label || null;
    this._render();
    this._notify(true);
  }

  reverseAll() {
    this._pushHistory();
    this._points.reverse();
    this._render();
    this._notify(true);
  }

  reorder(fromIndex, toIndex) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this._points.length ||
      toIndex >= this._points.length
    ) {
      return;
    }
    this._pushHistory();
    const [moved] = this._points.splice(fromIndex, 1);
    this._points.splice(toIndex, 0, moved);
    this._render();
    this._notify(true);
  }

  replaceAll(points) {
    this._pushHistory();
    this._points = points.map((p) => ({ id: newId(), lat: p.lat, lon: p.lon, label: p.label ?? null }));
    this._selectedId = null;
    this._render();
    this._notify(true);
  }

  clear() {
    this._pushHistory();
    this._points = [];
    this._selectedId = null;
    this._render();
    this._notify(true);
  }

  /** Positionne les marqueurs en mode silencieux, sans déclencher de recalcul
   * ni d'autosave. Réinitialise aussi l'historique undo/redo : charger un
   * contexte différent (aperçu d'un trajet sauvegardé, restauration de
   * brouillon) ne doit pas permettre d'annuler vers l'état d'un trajet
   * précédent sans rapport. */
  setPointsSilently(points) {
    const { points: normalized, nextId } = normalizeIds(points, _nextId);
    _nextId = nextId;
    this._points = normalized.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, label: p.label ?? null }));
    this._selectedId = null;
    this._history.reset();
    this._render();
    this._notify(false);
  }

  selectPoint(id) {
    this._selectedId = id;
    this._render();
  }

  clearSelection() {
    this._selectedId = null;
    this._render();
  }

  getPoints() {
    return this._points.map((p) => ({ ...p }));
  }

  /** Désactive temporairement l'ajout d'un point au clic carte — utilisé
   * pendant qu'un autre mode "prochain clic = ..." attend sa propre
   * interaction, voir controllers/round-trip-controller.js. */
  setAddOnMapClickEnabled(enabled) {
    this._addOnMapClick = enabled;
  }

  isAddOnMapClickEnabled() {
    return this._addOnMapClick;
  }

  _notify(userChange) {
    this._store.setState({ waypoints: this.getPoints() }, { userChange });
  }

  _pointForMarker(marker) {
    const index = this._markers.findIndex((entry) => entry.marker === marker);
    return index >= 0 ? this._points[index] : null;
  }

  _createMarker(point, index, total) {
    const { color, badge } = roleForIndex(index, total);
    const selected = point.id === this._selectedId;
    const tooltipEl = document.createElement("span");
    const marker = L.marker([point.lat, point.lon], {
      icon: pinIcon(color, badge, selected),
      draggable: true,
      autoPan: true,
      riseOnHover: true,
    }).addTo(this._map);
    // Contenu en nœud DOM (textContent) : le libellé d'un point vient d'une
    // saisie, d'un géocodage ou d'un fichier GPX.
    marker.bindTooltip(tooltipEl, { direction: "top", offset: [0, -PIN_SIZE / 2] });

    // Les gestionnaires retrouvent leur point au moment de l'événement : un
    // même marqueur est réutilisé quand l'ordre des points change.
    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      const point = this._pointForMarker(marker);
      if (point) this.selectPoint(point.id);
    });
    marker.on("dragend", () => {
      const point = this._pointForMarker(marker);
      if (!point) return;
      const { lat, lng } = marker.getLatLng();
      this.updatePoint(point.id, lat, lng);
    });
    marker.on("contextmenu", (e) => {
      // Empêche le menu du navigateur et la création de point d'intérêt
      // (clic droit sur la carte, main.js).
      L.DomEvent.stop(e);
      if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
      const point = this._pointForMarker(marker);
      if (point) this.removePoint(point.id);
    });

    return { marker, iconKey: iconKeyFor(color, badge, selected), tooltipEl };
  }

  /** Met à jour les marqueurs existants plutôt que de tout recréer : seuls
   * un changement du nombre de points recrée les marqueurs, et seuls une
   * icône, une position ou une infobulle réellement modifiées touchent au
   * DOM. */
  _render() {
    const total = this._points.length;
    if (this._markers.length !== total) {
      this._markers.forEach((entry) => entry.marker.remove());
      this._markers = this._points.map((p, idx) => this._createMarker(p, idx, total));
    }

    this._points.forEach((p, idx) => {
      const entry = this._markers[idx];
      const { color, badge, label } = roleForIndex(idx, total);
      const selected = p.id === this._selectedId;

      const iconKey = iconKeyFor(color, badge, selected);
      if (entry.iconKey !== iconKey) {
        entry.marker.setIcon(pinIcon(color, badge, selected));
        entry.iconKey = iconKey;
      }

      const current = entry.marker.getLatLng();
      if (current.lat !== p.lat || current.lng !== p.lon) entry.marker.setLatLng([p.lat, p.lon]);

      const tooltipText = `${p.label || label} — ${MARKER_HINT}`;
      if (entry.tooltipEl.textContent !== tooltipText) entry.tooltipEl.textContent = tooltipText;
    });
  }
}
