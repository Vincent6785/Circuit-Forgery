import L from "leaflet";

export const FORCED_POINT_COLOR = "#6a1b9a";

/** Affiche les points de passage imposés à la prochaine génération de circuit
 * (onglet Boucle) sous forme de pastilles numérotées, et permet de les
 * retirer via un lien dans leur popup. Même contrat que AvoidZoneLayer :
 * onRemove(index) reçoit la position du point retiré dans le tableau passé à
 * render().
 *
 * Ces points ne sont pas des waypoints : ils n'existent que tant que le
 * circuit n'a pas été généré, d'où un calque à part plutôt qu'un détour par
 * WaypointManager. */
export class ForcedPointLayer {
  constructor(map, onRemove) {
    this._map = map;
    this._onRemove = onRemove;
    this._markers = [];
  }

  render(points) {
    this._markers.forEach((m) => m.remove());
    this._markers = points.map((point, index) => {
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: FORCED_POINT_COLOR,
        fillOpacity: 1,
      }).addTo(this._map);

      const container = document.createElement("div");
      container.textContent = `Point de passage ${index + 1} `;
      const removeLink = document.createElement("a");
      removeLink.href = "#";
      removeLink.textContent = "✕ Retirer";
      removeLink.addEventListener("click", (e) => {
        e.preventDefault();
        this._onRemove(index);
        this._map.closePopup();
      });
      container.appendChild(removeLink);
      marker.bindPopup(container);

      return marker;
    });
  }
}
