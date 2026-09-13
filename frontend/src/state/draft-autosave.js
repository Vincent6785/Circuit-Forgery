import { saveDraft } from "./draft-storage.js";

const DEBOUNCE_MS = 800;
// Clés modifiées hors changement utilisateur (résultat d'un calcul d'itinéraire, choix
// d'une alternative, sortie du mode modification) qui doivent tout de même
// rejoindre un brouillon en cours.
const TRACKED_SILENT_KEYS = ["computedRoute", "editingRouteId"];

/** Sauvegarde le brouillon en localStorage après chaque mutation utilisateur.
 *
 * Les changements qui ne viennent pas de l'utilisateur — aperçu d'un trajet
 * sauvegardé, restauration du brouillon lui-même — ne rendent pas le brouillon
 * "à sauvegarder" ; en revanche, une fois une mutation utilisateur en attente,
 * un changement des clés suivies relance la sauvegarde. L'état écrit est lu au
 * moment de l'écriture, pas au moment de la mutation : sans ça, le brouillon
 * contenait les nouveaux points avec le tracé calculé pour les précédents.
 *
 * Renvoie { flush, cancel } : flush écrit immédiatement un brouillon en
 * attente (fermeture de la page), cancel l'abandonne (trajet sauvegardé,
 * effacé ou rechargé depuis la liste) — sans quoi une écriture programmée
 * juste avant pouvait recréer le brouillon qu'on venait d'effacer.
 *
 * @param {{
 *   getState: () => Record<string, any>,
 *   subscribe: (listener: (state: Record<string, any>, meta: import("./store.js").UpdateMeta) => void) => unknown
 * }} store
 * @param {{ debounceMs?: number, save?: (state: Record<string, any>) => unknown }} [options]
 */
export function initDraftAutosave(store, { debounceMs = DEBOUNCE_MS, save = saveDraft } = {}) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let dirty = false;
  let tracked = pick(store.getState());

  /** @param {Record<string, any>} state */
  function pick(state) {
    return TRACKED_SILENT_KEYS.map((key) => state[key]);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (dirty) save(store.getState());
  }

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    dirty = false;
  }

  store.subscribe((state, meta) => {
    const next = pick(state);
    const trackedChanged = next.some((value, i) => value !== tracked[i]);
    tracked = next;
    if (meta.userChange) {
      dirty = true;
      schedule();
    } else if (dirty && trackedChanged) {
      schedule();
    }
  });

  return { flush, cancel };
}
