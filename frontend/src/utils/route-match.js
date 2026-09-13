// Écart toléré entre la distance enregistrée d'un trajet et celle d'un
// recalcul des mêmes points : au-delà, les données routières ont changé
// depuis l'enregistrement, et le tracé recalculé n'est plus celui enregistré.
const MIN_TOLERANCE_M = 50;
const RELATIVE_TOLERANCE = 0.01;

/** Vrai si un recalcul peut remplacer le tracé enregistré (même trajet, à la
 * précision du calcul près).
 *
 * @param {number} savedDistanceM
 * @param {number} computedDistanceM
 */
export function isSameRoute(savedDistanceM, computedDistanceM) {
  if (!Number.isFinite(savedDistanceM) || !Number.isFinite(computedDistanceM)) return false;
  const tolerance = Math.max(MIN_TOLERANCE_M, RELATIVE_TOLERANCE * Math.max(savedDistanceM, computedDistanceM));
  return Math.abs(savedDistanceM - computedDistanceM) <= tolerance;
}
