/** Vrai si la position d'un événement souris tombe dans le rectangle de
 * l'élément (bords inclus) — utilisé pour annuler un glisser relâché hors
 * de la carte. */
export function isEventInside(element, event) {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}
