const DRAFT_KEY = "circuit-forgery:draft:v1";

/** Accès au stockage local, ou null s'il est indisponible : le simple accès
 * à localStorage peut lever une exception (navigation privée, stockage
 * bloqué par le navigateur). */
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** @param {Record<string, any>} state */
export function serializeDraft(state) {
  return {
    waypoints: state.waypoints,
    computedRoute: state.computedRoute,
    avoidZones: state.avoidZones,
    speedLimitKmh: state.speedLimitKmh,
    noSpeedLimit: state.noSpeedLimit,
    pendingForcedPoints: state.pendingForcedPoints,
    evEnabled: state.evEnabled,
    evSettings: state.evSettings,
    roundTripVariant: state.roundTripVariant,
    // Sans ça, recharger la page pendant la modification d'un trajet
    // sauvegardé le restaurait comme un nouveau trajet : "Sauvegarder" créait
    // alors un doublon au lieu de mettre l'original à jour.
    editingRouteId: state.editingRouteId,
    savedAt: new Date().toISOString(),
  };
}

/** Écrit le brouillon ; renvoie false s'il n'a pas pu l'être. En cas de
 * quota dépassé, retente sans le tracé calculé — de loin la partie la plus
 * volumineuse, et recalculée à la restauration.
 *
 * @param {Record<string, any>} state
 */
export function saveDraft(state) {
  const store = storage();
  if (!store) return false;
  const draft = serializeDraft(state);
  try {
    store.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    try {
      store.setItem(DRAFT_KEY, JSON.stringify({ ...draft, computedRoute: null }));
      return true;
    } catch (err) {
      console.warn("Brouillon local non sauvegardé (stockage indisponible ou plein) :", err);
      return false;
    }
  }
}

export function loadDraft() {
  let raw;
  try {
    raw = storage()?.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    return draft && typeof draft === "object" && Array.isArray(draft.waypoints) ? draft : null;
  } catch (err) {
    console.warn("Brouillon local illisible, ignoré :", err);
    return null;
  }
}

export function clearDraft() {
  try {
    storage()?.removeItem(DRAFT_KEY);
  } catch {
    // Stockage inaccessible : il n'y a de toute façon rien à effacer.
  }
}
