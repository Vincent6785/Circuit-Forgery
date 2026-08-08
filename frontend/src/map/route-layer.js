import L from "leaflet";

function speedColor(speed) {
  if (speed == null) return "#888888";
  if (speed <= 50) return "#2e7d32"; // vert
  if (speed <= 70) return "#f9a825"; // jaune/orange
  return "#e64a19"; // orange foncé (ne devrait pas dépasser 80 grâce au filtre)
}

export class RouteLayer {
  constructor(map, insertInteraction = null) {
    this._map = map;
    this._segments = [];
    this._insertInteraction = insertInteraction;
  }

  clear() {
    this._segments.forEach((s) => s.remove());
    this._segments = [];
  }

  /**
   * geometry_geojson: { type: "LineString", coordinates: [[lon, lat], ...] }
   * maxSpeedBySegment: valeur de max_speed (ou null) pour chaque point du tracé
   * legBoundaries: index de chaque waypoint demandé dans coordinates (cf. backend
   *   route_enrichment.py) — permet à insertInteraction de déterminer entre quels
   *   deux waypoints insérer un point glissé sur le tracé.
   */
  draw(geometryGeojson, maxSpeedBySegment, legBoundaries = []) {
    this.clear();
    const coords = geometryGeojson.coordinates;
    this._insertInteraction?.setLegBoundaries(legBoundaries);

    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      const speed = maxSpeedBySegment?.[i] ?? null;
      const line = L.polyline(
        [
          [lat1, lon1],
          [lat2, lon2],
        ],
        { color: speedColor(speed), weight: 5, opacity: 0.85 }
      ).addTo(this._map);
      if (speed != null) {
        line.bindTooltip(`${speed} km/h`, { sticky: true });
      }
      this._insertInteraction?.attachToSegment(line, i);
      this._segments.push(line);
    }

    if (coords.length > 0) {
      this._map.fitBounds(L.latLngBounds(coords.map(([lon, lat]) => [lat, lon])), { padding: [30, 30] });
    }
  }
}
