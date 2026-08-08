import "leaflet/dist/leaflet.css";
import L from "leaflet";

export function createMap(containerId) {
  const map = L.map(containerId).setView([46.6, 2.5], 6); // centre approximatif de la France

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  return map;
}
