import L from "leaflet";

/** Fabrique un L.divIcon à partir d'un fragment HTML. Regroupe ici le
 * className vide et la forme commune à tous les marqueurs "div" du projet
 * (points de trajet, POI) : seul leur contenu visuel diffère — pastille
 * colorée ou emoji selon le cas. */
export function buildDivIcon(html, { size, anchor }) {
  return L.divIcon({
    className: "",
    html,
    iconSize: size,
    iconAnchor: anchor,
  });
}
