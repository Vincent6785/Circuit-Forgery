import L from "leaflet";

const ZONE_COLOR = "#c62828";

/** Affiche les zones à éviter (cercles semi-transparents) et permet de les
 * retirer via un lien dans leur popup. onRemove(index) est appelé avec la
 * position de la zone dans le tableau reçu par render(). */
export class AvoidZoneLayer {
  constructor(map, onRemove) {
    this._map = map;
    this._onRemove = onRemove;
    this._circles = [];
  }

  render(zones) {
    this._circles.forEach((c) => c.remove());
    this._circles = zones.map((zone, index) => {
      const circle = L.circle([zone.lat, zone.lon], {
        radius: zone.radiusM,
        color: ZONE_COLOR,
        weight: 2,
        fillColor: ZONE_COLOR,
        fillOpacity: 0.15,
      }).addTo(this._map);

      const container = document.createElement("div");
      container.textContent = `Zone à éviter (${Math.round(zone.radiusM)} m) `;
      const removeLink = document.createElement("a");
      removeLink.href = "#";
      removeLink.textContent = "✕ Retirer";
      removeLink.addEventListener("click", (e) => {
        e.preventDefault();
        this._onRemove(index);
        this._map.closePopup();
      });
      container.appendChild(removeLink);
      circle.bindPopup(container);

      return circle;
    });
  }
}
