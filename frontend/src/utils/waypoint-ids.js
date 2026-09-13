/** Garantit des identifiants de waypoint uniques, entiers positifs, et
 * renvoie le prochain identifiant libre.
 *
 * Les identifiants restaurés d'un brouillon sont conservés tant qu'ils sont
 * valides et uniques : le compteur de WaypointManager, lui, repart de 1 à
 * chaque chargement de page, et doit donc repartir au-delà du plus grand
 * identifiant restauré — sans ça, le point suivant réutiliserait un
 * identifiant existant, et supprimer ou modifier l'un toucherait l'autre.
 * Un identifiant absent (trajet sauvegardé), invalide ou dupliqué est
 * remplacé par un nouveau. */
export function normalizeIds(points, nextId) {
  let next = nextId;
  for (const p of points) {
    if (Number.isSafeInteger(p.id) && p.id >= next) next = p.id + 1;
  }
  const seen = new Set();
  const normalized = points.map((p) => {
    let id = p.id;
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) id = next++;
    seen.add(id);
    return { ...p, id };
  });
  return { points: normalized, nextId: next };
}
