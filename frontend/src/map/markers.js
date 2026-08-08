import L from "leaflet";
import { roleForIndex } from "./waypoint-role.js";
import { buildDivIcon } from "./icon-utils.js";

const SELECTED_OUTLINE = "#f9a825";

function dotIcon(color, selected) {
  const outline = selected ? `box-shadow:0 0 0 3px ${SELECTED_OUTLINE};` : "box-shadow:0 0 2px rgba(0,0,0,0.6);";
  return buildDivIcon(
    `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;${outline}"></div>`,
    { size: [14, 14], anchor: [7, 7] }
  );
}

let _nextId = 1;
function newId() {
  return _nextId++;
}

/**
 * Gère les waypoints d'un trajet : marqueurs sur la carte, et état reflété
 * dans le store (clé "waypoints"). Chaque mutation utilisateur (ajout,
 * suppression, déplacement, réorganisation) notifie le store en mode
 * non-silencieux, ce qui déclenche recalcul et autosave chez les abonnés ;
 * setPointsSilently — aperçu d'un trajet sauvegardé, restauration de
 * brouillon — notifie au contraire en mode silencieux.
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
    this._points = []; // liste de {id, lat, lon}
    this._markers = [];
    this._selectedId = null;
    this._addOnMapClick = true;

    map.on("click", (e) => {
      if (!this._addOnMapClick) return;
      this.addPoint(e.latlng.lat, e.latlng.lng);
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
    this._store.setState({ waypoints: this.getPoints(), avoidZones: snapshot.avoidZones }, { silent: false });
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

  addPoint(lat, lon, label = null) {
    this._pushHistory();
    this._points.push({ id: newId(), lat, lon, label });
    this._selectedId = null;
    this._render();
    this._notify(false);
  }

  insertPointAt(index, lat, lon, label = null) {
    this._pushHistory();
    const clamped = Math.max(0, Math.min(index, this._points.length));
    this._points.splice(clamped, 0, { id: newId(), lat, lon, label });
    this._selectedId = null;
    this._render();
    this._notify(false);
  }

  removePoint(id) {
    this._pushHistory();
    this._points = this._points.filter((p) => p.id !== id);
    if (this._selectedId === id) this._selectedId = null;
    this._render();
    this._notify(false);
  }

  updatePoint(id, lat, lon) {
    const point = this._points.find((p) => p.id === id);
    if (!point) return;
    this._pushHistory();
    point.lat = lat;
    point.lon = lon;
    this._render();
    this._notify(false);
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
    this._notify(false);
  }

  reverseAll() {
    this._pushHistory();
    this._points.reverse();
    this._render();
    this._notify(false);
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
    this._notify(false);
  }

  replaceAll(points) {
    this._pushHistory();
    this._points = points.map((p) => ({ id: newId(), lat: p.lat, lon: p.lon, label: p.label ?? null }));
    this._selectedId = null;
    this._render();
    this._notify(false);
  }

  clear() {
    this._pushHistory();
    this._points = [];
    this._selectedId = null;
    this._render();
    this._notify(false);
  }

  /** Positionne les marqueurs en mode silencieux, sans déclencher de recalcul
   * ni d'autosave. Réinitialise aussi l'historique undo/redo : charger un
   * contexte différent (aperçu d'un trajet sauvegardé, restauration de
   * brouillon) ne doit pas permettre d'annuler vers l'état d'un trajet
   * précédent sans rapport. */
  setPointsSilently(points) {
    this._points = points.map((p) => ({ id: p.id ?? newId(), lat: p.lat, lon: p.lon, label: p.label ?? null }));
    this._selectedId = null;
    this._history.reset();
    this._render();
    this._notify(true);
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

  _notify(silent) {
    this._store.setState({ waypoints: this.getPoints() }, { silent });
  }

  _render() {
    this._markers.forEach((m) => m.remove());
    this._markers = this._points.map((p, idx) => {
      const { color } = roleForIndex(idx, this._points.length);
      const marker = L.marker([p.lat, p.lon], {
        icon: dotIcon(color, p.id === this._selectedId),
        draggable: true,
      }).addTo(this._map);

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        this.selectPoint(p.id);
      });
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        this.updatePoint(p.id, lat, lng);
      });
      return marker;
    });
  }
}
