import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Serveur de tuiles par défaut, sans le sous-domaine {s} que la politique
// d'usage d'OpenStreetMap déconseille. Remplaçable côté backend
// (CF_TILE_URL), qui l'expose via /api/config et l'autorise dans la CSP.
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";

/** Crée la carte immédiatement avec le fond par défaut ; applyTileConfig()
 * remplace ensuite le serveur de tuiles si le backend en configure un autre,
 * sans retarder l'affichage de la carte. */
export function createMap(containerId) {
  const map = L.map(containerId).setView([46.6, 2.5], 6); // vue initiale centrée sur la France
  const tileLayer = L.tileLayer(DEFAULT_TILE_URL, {
    maxZoom: 19,
    attribution: DEFAULT_TILE_ATTRIBUTION,
  }).addTo(map);

  function applyTileConfig({ tile_url: url, tile_attribution: attribution } = {}) {
    if (url && url !== tileLayer._url) tileLayer.setUrl(url);
    if (attribution && attribution !== tileLayer.options.attribution) {
      map.attributionControl.removeAttribution(tileLayer.options.attribution);
      tileLayer.options.attribution = attribution;
      map.attributionControl.addAttribution(attribution);
    }
  }

  return { map, applyTileConfig };
}
