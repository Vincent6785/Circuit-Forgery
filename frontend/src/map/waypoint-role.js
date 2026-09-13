// Mêmes teintes que les variables --color-start/--color-end/--color-step de
// style.css (pastilles des champs de l'onglet Itinéraire).
const START_COLOR = "#2e7d32";
const END_COLOR = "#c62828";
const WAYPOINT_COLOR = "#1565c0";

/** Détermine couleur, libellé et badge d'un waypoint selon sa position dans
 * le trajet — partagé entre les marqueurs sur la carte (markers.js) et la
 * liste de la sidebar (waypoint-list.js), pour rester cohérent. Le badge
 * ("A", "B" ou le numéro d'étape) dérive uniquement de la position, jamais
 * d'un libellé saisi : il peut donc être injecté tel quel dans le HTML d'une
 * icône. */
export function roleForIndex(index, total) {
  const isStart = index === 0;
  const isEnd = index === total - 1 && total > 1;
  if (isStart) return { label: "Départ", color: START_COLOR, badge: "A" };
  if (isEnd) return { label: "Arrivée", color: END_COLOR, badge: "B" };
  return { label: `Étape ${index}`, color: WAYPOINT_COLOR, badge: String(index) };
}
