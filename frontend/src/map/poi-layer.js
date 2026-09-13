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

/** Contenu de popup construit en DOM (textContent) : nom et notes sont des
 * saisies libres stockées en base, qu'une chaîne HTML passée à bindPopup
 * interpréterait (XSS stockée). */
function popupContent(poi) {
  const container = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = poi.name;
  container.appendChild(name);
  if (poi.notes) {
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createTextNode(poi.notes));
  }
  return container;
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
      marker.bindPopup(popupContent(poi));
      return marker;
    });
  }

  panTo(poi) {
    this._map.setView([poi.lat, poi.lon], Math.max(this._map.getZoom(), 14));
  }
}
