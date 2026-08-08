/**
 * Store pub/sub minimal. `meta.silent = true` signale le chargement d'un état
 * déjà connu (aperçu d'un trajet sauvegardé, restauration d'un brouillon) :
 * les abonnés qui ne doivent réagir qu'à une mutation utilisateur (recalcul
 * d'itinéraire, autosave du brouillon) doivent l'ignorer.
 */
export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(patch, meta = {}) {
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state, meta));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
