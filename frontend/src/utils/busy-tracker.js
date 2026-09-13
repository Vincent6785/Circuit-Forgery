// @ts-check

/**
 * Compte les opérations en cours (calcul d'itinéraire, génération de boucle,
 * import…) et signale seulement les transitions : onChange(true) quand la
 * première commence, onChange(false) quand la dernière se termine, qu'elle
 * réussisse ou échoue. Des opérations qui se chevauchent ne font donc pas
 * clignoter l'indicateur.
 *
 * @param {(busy: boolean) => void} onChange
 */
export function createBusyTracker(onChange) {
  let pending = 0;

  return {
    /**
     * @template T
     * @param {Promise<T>} promise
     * @returns {Promise<T>} La même valeur, ou la même erreur.
     */
    async track(promise) {
      pending += 1;
      if (pending === 1) onChange(true);
      try {
        return await promise;
      } finally {
        pending -= 1;
        if (pending === 0) onChange(false);
      }
    },

    isBusy() {
      return pending > 0;
    },
  };
}
