import L from "leaflet";
import { buildDivIcon } from "./icon-utils.js";

export const POI_CATEGORIES = [
  { value: "carburant", label: "⛽ Carburant" },
  { value: "restauration", label: "🍽 Restauration" },
  { value: "hebergement", label: "🛏 Hébergement" },
  { value: "point_de_vue", label: "📷 Point de vue" },
  { value: "mecanicien", label: "🔧 Mécanicien" },
  { value: "autre", label: "📍 Autre" },
];

const EMOJI_BY_CATEGORY = Object.fromEntries(
  POI_CATEGORIES.map(({ value, label }) => [value, label.split(" ")[0]])
);
const DEFAULT_EMOJI = "📍";

/** Réutilisé par ui/poi-list.js pour préfixer chaque entrée de la sidebar du
 * même emoji que le marqueur affiché sur la carte. */
export function categoryEmoji(category) {
  return EMOJI_BY_CATEGORY[category] || DEFAULT_EMOJI;
}

function poiIcon(category) {
  return buildDivIcon(`<div style="font-size:20px;line-height:1;">${categoryEmoji(category)}</div>`, {
    size: [24, 24],
    anchor: [12, 20],
  });
}

export class POILayer {
  constructor(map) {
    this._map = map;
    this._markers = [];
  }

  render(pois) {
    this._markers.forEach((m) => m.remove());
    this._markers = pois.map((poi) => {
      const marker = L.marker([poi.lat, poi.lon], { icon: poiIcon(poi.category) }).addTo(this._map);
      const notes = poi.notes ? `<br>${poi.notes}` : "";
      marker.bindPopup(`<strong>${poi.name}</strong>${notes}`);
      return marker;
    });
  }

  panTo(poi) {
    this._map.setView([poi.lat, poi.lon], Math.max(this._map.getZoom(), 14));
  }
}
