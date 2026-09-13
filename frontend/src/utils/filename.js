// @ts-check

// Caractères interdits dans un nom de fichier sous Windows, macOS ou Linux.
const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|]/g;
// Caractères de contrôle (tabulation, retour à la ligne…).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;
const MAX_BASE_NAME_LENGTH = 100;

/**
 * Nom de fichier GPX sûr pour un trajet : caractères interdits remplacés,
 * longueur bornée, nom par défaut si le trajet n'a pas (encore) de nom.
 *
 * @param {string | null | undefined} routeName
 * @returns {string}
 */
export function gpxFileName(routeName) {
  const base = (routeName ?? "")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(FORBIDDEN_CHARACTERS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BASE_NAME_LENGTH)
    // Pas de fichier caché ni de nom réduit à "." ou "..".
    .replace(/^\.+/, "")
    .trim();
  return `${base || "trajet"}.gpx`;
}
