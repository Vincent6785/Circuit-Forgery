// @ts-check

/**
 * @template T
 * @typedef {{ stale: false, value: T } | { stale: true }} LatestResult
 */

/**
 * "Dernier appel gagne" : chaque nouvelle requête annule la précédente
 * (AbortController) au lieu de la laisser aboutir pour rien, et le résultat
 * d'une requête remplacée entre-temps est signalé comme périmé.
 *
 * Remplace les compteurs de séquence écrits à la main dans chaque module
 * (calcul d'itinéraire, alternatives, recherche d'adresse, listes), qui
 * ignoraient bien la réponse périmée mais laissaient la requête aller au
 * bout — un calcul GraphHopper inutile à chaque frappe ou déplacement.
 */
export function createLatestRequest() {
  /** @type {AbortController | null} */
  let controller = null;

  return {
    /**
     * @template T
     * @param {(signal: AbortSignal) => Promise<T>} task
     * @returns {Promise<LatestResult<T>>} Rejette seulement pour une erreur de
     *   la requête toujours d'actualité.
     */
    async run(task) {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const value = await task(current.signal);
        return controller === current ? { stale: false, value } : { stale: true };
      } catch (error) {
        if (controller !== current || isAbortError(error)) return { stale: true };
        throw error;
      }
    },

    /** Annule la requête en cours, dont le résultat sera périmé. */
    cancel() {
      controller?.abort();
      controller = null;
    },
  };
}

/** @param {unknown} error */
export function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
