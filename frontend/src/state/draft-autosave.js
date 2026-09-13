import { saveDraft } from "./draft-storage.js";

const DEBOUNCE_MS = 800;
// Clés modifiées en mode silencieux (résultat d'un calcul d'itinéraire, choix
// d'une alternative, sortie du mode modification) qui doivent tout de même
// rejoindre un brouillon en cours.
const TRACKED_SILENT_KEYS = ["computedRoute", "editingRouteId"];

/** Sauvegarde le brouillon en localStorage après chaque mutation utilisateur.
 *
 * Les changements silencieux — aperçu d'un trajet sauvegardé, restauration
 * du brouillon lui-même — ne rendent pas le brouillon "à sauvegarder" ; en
 * revanche, une fois une mutation utilisateur en attente, un changement
 * silencieux des clés suivies relance la sauvegarde. L'état écrit est lu au
 * moment de l'écriture, pas au moment de la mutation : sans ça, le brouillon
 * contenait les nouveaux points avec le tracé calculé pour les précédents.
 *
 * Renvoie { flush, cancel } : flush écrit immédiatement un brouillon en
 * attente (fermeture de la page), cancel l'abandonne (trajet sauvegardé,
 * effacé ou rechargé depuis la liste) — sans quoi une écriture programmée
 * juste avant pouvait recréer le brouillon qu'on venait d'effacer. */
export function initDraftAutosave(store, { debounceMs = DEBOUNCE_MS, save = saveDraft } = {}) {
  let timer = null;
  let dirty = false;
  let tracked = pick(store.getState());

  function pick(state) {
    return TRACKED_SILENT_KEYS.map((key) => state[key]);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (dirty) save(store.getState());
  }

  function cancel() {
    clearTimeout(timer);
    timer = null;
    dirty = false;
  }

  store.subscribe((state, meta) => {
    const next = pick(state);
    const trackedChanged = next.some((value, i) => value !== tracked[i]);
    tracked = next;
    if (!meta.silent) {
      dirty = true;
      schedule();
    } else if (dirty && trackedChanged) {
      schedule();
    }
  });

  return { flush, cancel };
}
