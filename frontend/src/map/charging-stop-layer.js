import L from "leaflet";
import { buildDivIcon } from "./icon-utils.js";
import { chargingStopLines } from "../utils/charging-stop.js";

const STOP_COLOR = "#00796b";
const PIN_SIZE = 24;

/** Affiche les arrêts recharge d'un trajet électrique : pastilles ⚡
 * numérotées dans l'ordre de passage, avec le détail de la borne en popup.
 *
 * Ces arrêts ne sont pas des waypoints (le backend les insère pour le calcul
 * sans toucher à la liste des points de l'utilisateur) : ils ne sont ni
 * déplaçables ni supprimables, d'où un calque purement indicatif, sans
 * interaction d'édition — contrairement à map/markers.js. */
export class ChargingStopLayer {
  constructor(map) {
    this._map = map;
    this._markers = [];
  }

  clear() {
    this._markers.forEach((marker) => marker.remove());
    this._markers = [];
  }

  /** @param {Array<Record<string, any>>} stops */
  render(stops) {
    this.clear();
    this._markers = stops.map((stop, index) =>
      L.marker([stop.lat, stop.lon], {
        // Le badge est un numéro d'ordre, jamais un libellé issu des données :
        // son injection dans le HTML de l'icône est sûre (même règle que
        // map/waypoint-role.js).
        icon: buildDivIcon(
          `<div class="charging-pin" style="--pin-color:${STOP_COLOR}">${index + 1}</div>`,
          { size: [PIN_SIZE, PIN_SIZE], anchor: [PIN_SIZE / 2, PIN_SIZE / 2] }
        ),
        // Sous les marqueurs de waypoints : ce sont ceux-là qu'on manipule.
        zIndexOffset: -100,
      })
        .addTo(this._map)
        .bindPopup(popupContent(stop, index)),
    );
  }

  /** Centre la carte sur un arrêt et ouvre sa popup (clic dans la liste). */
  panTo(index) {
    const marker = this._markers[index];
    if (!marker) return;
    this._map.panTo(marker.getLatLng());
    marker.openPopup();
  }
}

/** Popup construite en nœuds DOM : le nom et l'adresse d'une borne viennent
 * d'un jeu de données ouvert, jamais interpolés dans du HTML. */
function popupContent(stop, index) {
  const container = document.createElement("div");

  const title = document.createElement("strong");
  title.textContent = `${index + 1}. ${stop.name}`;
  container.appendChild(title);

  for (const line of chargingStopLines(stop)) {
    const p = document.createElement("div");
    p.textContent = line;
    container.appendChild(p);
  }
  return container;
}
