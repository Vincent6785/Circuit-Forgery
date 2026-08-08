import L from "leaflet";

/** Fabrique un L.divIcon à partir d'un fragment HTML — factorise le
 * className vide et la forme commune à tous les marqueurs "div" du projet
 * (points de trajet, POI), dont le contenu visuel diffère (pastille colorée
 * vs emoji). */
export function buildDivIcon(html, { size, anchor }) {
  return L.divIcon({
    className: "",
    html,
    iconSize: size,
    iconAnchor: anchor,
  });
}
