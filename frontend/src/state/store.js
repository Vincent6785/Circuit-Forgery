// @ts-check

/**
 * @typedef {object} UpdateMeta
 * @property {boolean} [userChange] Mutation faite par l'utilisateur (ajout ou
 *   déplacement d'un point, zone, limite de vitesse…) : déclenche le recalcul
 *   d'itinéraire et l'autosave du brouillon. Absent pour un état chargé ou
 *   calculé (trajet sauvegardé, brouillon restauré, résultat de calcul).
 */

/**
 * @template {Record<string, any>} S
 * @callback Listener
 * @param {S} state État après la mise à jour.
 * @param {UpdateMeta} meta
 * @param {ReadonlySet<string>} changedKeys Clés dont la valeur a changé.
 * @returns {void}
 */

/**
 * Store pub/sub minimal.
 *
 * - Un abonné peut ne réagir qu'à certaines clés (`{ keys }`) : sans ce
 *   filtre, chaque mise à jour reconstruisait tout (calques de zones, listes,
 *   marqueur de point de passage), fermant au passage les popups ouverts.
 * - Une mise à jour demandée pendant la notification d'une autre est mise en
 *   file et appliquée après : chaque abonné voit les états dans l'ordre, et
 *   jamais un état plus ancien que celui qu'un abonné précédent a déjà vu.
 *
 * @template {Record<string, any>} S
 * @param {S} initialState
 */
export function createStore(initialState) {
  let state = { ...initialState };
  /** @type {Set<Listener<S>>} */
  const listeners = new Set();
  /** @type {Array<{ patch: Partial<S>, meta: UpdateMeta }>} */
  const queue = [];
  let notifying = false;

  return {
    /** @returns {S} */
    getState() {
      return state;
    },

    /**
     * @param {Partial<S>} patch
     * @param {UpdateMeta} [meta]
     */
    setState(patch, meta = {}) {
      queue.push({ patch, meta });
      if (notifying) return;
      notifying = true;
      try {
        while (queue.length > 0) {
          const next = /** @type {{ patch: Partial<S>, meta: UpdateMeta }} */ (queue.shift());
          const previous = state;
          state = { ...state, ...next.patch };
          const changedKeys = new Set(Object.keys(next.patch).filter((key) => previous[key] !== state[key]));
          for (const listener of [...listeners]) listener(state, next.meta, changedKeys);
        }
      } finally {
        notifying = false;
      }
    },

    /**
     * @param {Listener<S>} listener
     * @param {{ keys?: string[] }} [options] Ne notifier que si l'une de ces
     *   clés a changé.
     * @returns {() => void} Désabonnement.
     */
    subscribe(listener, { keys } = {}) {
      /** @type {Listener<S>} */
      const wrapped = keys
        ? (current, meta, changedKeys) => {
            if (keys.some((key) => changedKeys.has(key))) listener(current, meta, changedKeys);
          }
        : listener;
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
  };
}
