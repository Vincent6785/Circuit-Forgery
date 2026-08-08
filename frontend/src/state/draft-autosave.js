import { saveDraft } from "./draft-storage.js";

const DEBOUNCE_MS = 800;

/** Sauvegarde le brouillon en localStorage après chaque mutation utilisateur
 * (ignore les changements silencieux : aperçu d'un trajet sauvegardé, restauration
 * du brouillon lui-même — cf. state/store.js). */
export function initDraftAutosave(store) {
  let timer = null;
  store.subscribe((state, meta) => {
    if (meta.silent) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveDraft(state), DEBOUNCE_MS);
  });
}
