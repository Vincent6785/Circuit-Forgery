const MAX_HISTORY = 50;

/** Pile undo/redo générique et bornée, indifférente au contenu snapshotté :
 * l'appelant (waypoints et zones à éviter, voir markers.js et
 * avoid-zone-controller.js) fournit et reçoit des objets snapshot opaques.
 * Cette neutralité permet à plusieurs sources de mutations indépendantes de
 * partager un seul historique cohérent — undo() restaure toujours tout ce
 * qui a été poussé ensemble, dans l'ordre. */
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
