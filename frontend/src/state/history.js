const MAX_HISTORY = 50;

/** Pile undo/redo générique et bornée, agnostique du contenu snapshotté —
 * le caller (waypoints + zones à éviter, cf. markers.js/avoid-zone-controller.js)
 * fournit et reçoit des objets snapshot opaques, ce qui permet à plusieurs
 * sources de mutations indépendantes de partager un seul historique cohérent
 * (undo() restaure tout ce qui a été poussé ensemble, dans l'ordre). */
export function createHistory() {
  let past = [];
  let future = [];

  return {
    push(snapshot) {
      past.push(snapshot);
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
    },
    undo(currentSnapshot) {
      if (past.length === 0) return null;
      future.push(currentSnapshot);
      return past.pop();
    },
    redo(currentSnapshot) {
      if (future.length === 0) return null;
      past.push(currentSnapshot);
      if (past.length > MAX_HISTORY) past.shift();
      return future.pop();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    reset() {
      past = [];
      future = [];
    },
  };
}
