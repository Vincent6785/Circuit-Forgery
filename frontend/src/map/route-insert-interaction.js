import L from "leaflet";

/**
 * Glisser-déposer sur le tracé affiché pour insérer un nouveau waypoint entre
 * deux waypoints existants (comme Google Maps/Komoot). attachToSegment() est
 * appelé par RouteLayer pour chaque segment du tracé ; onInsert(legIndex, lat, lon)
 * est appelé au relâchement, legIndex désignant la paire de waypoints consécutifs
 * (waypoint[legIndex] -> waypoint[legIndex+1]) entre laquelle insérer le point.
 */
export class RouteInsertInteraction {
  constructor(map, onInsert) {
    this._map = map;
    this._onInsert = onInsert;
    this._legBoundaries = [];
    this._ghost = null;
  }

  setLegBoundaries(legBoundaries) {
    this._legBoundaries = legBoundaries;
  }

  attachToSegment(polyline, segmentStartIndex) {
    polyline.on("mousedown", (e) => this._startDrag(e, segmentStartIndex));
  }

  _startDrag(e, segmentStartIndex) {
    L.DomEvent.stop(e);
    this._map.dragging.disable();
    this._ghost = L.circleMarker(e.latlng, {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#1565c0",
      fillOpacity: 1,
    }).addTo(this._map);

    const onMove = (ev) => {
      this._ghost.setLatLng(ev.latlng);
    };
    const onUp = (ev) => {
      this._map.off("mousemove", onMove);
      this._map.off("mouseup", onUp);
      this._map.dragging.enable();
      this._ghost.remove();
      this._ghost = null;

      const legIndex = this._legIndexForCoordIndex(segmentStartIndex);
      this._onInsert(legIndex, ev.latlng.lat, ev.latlng.lng);
    };

    this._map.on("mousemove", onMove);
    this._map.on("mouseup", onUp);
  }

  /** Paire de waypoints consécutifs (index de leg) contenant l'index de coordonnée donné. */
  _legIndexForCoordIndex(coordIndex) {
    let legIndex = 0;
    for (let i = 0; i < this._legBoundaries.length; i++) {
      if (this._legBoundaries[i] <= coordIndex) legIndex = i;
    }
    return legIndex;
  }
}
