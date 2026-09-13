import { cheapestInsertionIndex } from "./geo.js";
import { legIndexForCoordIndex } from "./route-segments.js";

/** Champs de saisie de l'onglet Itinéraire : départ (A), arrivée (B), et
 * étape intermédiaire. */
export const ITINERARY_FIELDS = ["start", "end", "step"];

/** @typedef {{ id?: number, lat: number, lon: number, label?: string | null }} ItineraryPoint */

/** Position d'insertion d'un nouveau point cliqué sur la carte (ou choisi
 * comme étape). Les deux premiers points deviennent départ puis arrivée ;
 * au-delà, le point est inséré entre les deux points consécutifs qui
 * minimisent le détour, pour que l'arrivée reste l'arrivée. `append` force
 * l'ancien comportement (ajout en fin : le point devient la nouvelle
 * arrivée), utilisé par Maj + clic.
 *
 * @param {ItineraryPoint[]} points
 * @param {{ lat: number, lon: number }} point
 * @param {{ append?: boolean }} [options]
 */
export function indexForNewPoint(points, point, { append = false } = {}) {
  if (append || points.length < 2) return points.length;
  return cheapestInsertionIndex(points, point) + 1;
}

/** Position d'insertion d'une étape déposée en glissant le tracé, depuis le
 * segment attrapé (segmentIndex). Les bornes de legs du calcul d'itinéraire
 * ne sont exploitables que si elles correspondent aux points actuels : un
 * trajet sauvegardé rouvert est affiché sans elles, et des bornes d'un
 * calcul précédent seraient périmées. On se rabat alors sur la position de
 * dépôt, comme pour un clic.
 *
 * @param {ItineraryPoint[]} points
 * @param {number[] | null | undefined} legBoundaries
 * @param {number} segmentIndex
 * @param {{ lat: number, lon: number }} point
 */
export function indexForRouteDrop(points, legBoundaries, segmentIndex, point) {
  if (points.length < 2 || !legBoundaries || legBoundaries.length !== points.length) {
    return indexForNewPoint(points, point);
  }
  return legIndexForCoordIndex(legBoundaries, segmentIndex) + 1;
}

/** Un champ n'est utilisable que lorsque son rôle a un sens : l'arrivée
 * suppose un départ, une étape suppose un départ et une arrivée.
 *
 * @param {ItineraryPoint[]} points
 * @param {string} field
 */
export function isFieldEnabled(points, field) {
  if (field === "start") return true;
  if (field === "end") return points.length >= 1;
  if (field === "step") return points.length >= 2;
  return false;
}

/** Mutation à appliquer quand une adresse est choisie dans un champ :
 * `{ type: "edit", id }` remplace un point existant (en gardant son
 * identité, donc sa place dans l'historique et la liste),
 * `{ type: "insert", index }` en ajoute un. Renvoie null si le champ est
 * inutilisable dans l'état courant.
 *
 * @param {ItineraryPoint[]} points
 * @param {string} field
 * @param {{ lat: number, lon: number }} point
 * @returns {{ type: "edit", id: number | undefined } | { type: "insert", index: number } | null}
 */
export function searchFieldAction(points, field, point) {
  if (!isFieldEnabled(points, field)) return null;
  if (field === "start") {
    return points.length === 0 ? { type: "insert", index: 0 } : { type: "edit", id: points[0].id };
  }
  if (field === "end") {
    return points.length === 1
      ? { type: "insert", index: 1 }
      : { type: "edit", id: points[points.length - 1].id };
  }
  return { type: "insert", index: indexForNewPoint(points, point) };
}

/** Texte affiché dans un champ hors saisie : le nom du point, ou ses
 * coordonnées s'il n'en a pas. Le champ étape reste vide (il sert
 * uniquement à ajouter).
 *
 * @param {ItineraryPoint[]} points
 * @param {string} field
 */
export function fieldDisplayValue(points, field) {
  /** @type {ItineraryPoint | null} */
  let point = null;
  if (field === "start") point = points[0] ?? null;
  else if (field === "end" && points.length >= 2) point = points[points.length - 1];
  if (!point) return "";
  return point.label || `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}
