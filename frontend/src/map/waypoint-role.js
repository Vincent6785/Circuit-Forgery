const START_COLOR = "#2e7d32";
const END_COLOR = "#c62828";
const WAYPOINT_COLOR = "#1565c0";

/** Détermine couleur et libellé d'un waypoint selon sa position dans le
 * trajet — partagé entre les marqueurs sur la carte (markers.js) et la
 * liste de la sidebar (waypoint-list.js), pour rester cohérent. */
export function roleForIndex(index, total) {
  const isStart = index === 0;
  const isEnd = index === total - 1 && total > 1;
  if (isStart) return { label: "Départ", color: START_COLOR };
  if (isEnd) return { label: "Arrivée", color: END_COLOR };
  return { label: `Étape ${index}`, color: WAYPOINT_COLOR };
}
