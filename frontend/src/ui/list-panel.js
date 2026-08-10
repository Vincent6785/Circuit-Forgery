import { showRouteError } from "./sidebar.js";

/**
 * Squelette commun à toutes les listes de la sidebar (trajets sauvegardés,
 * points d'intérêt, zones à éviter) : récupération des données (erreur
 * affichée dans le bandeau générique en cas d'échec, pertinent seulement si
 * itemsOrFetcher est une fonction async), puis vidage et repeuplement d'un
 * <ul> avec un <li> par élément — libellé cliquable et actions (boutons ou
 * liens) fournis par l'appelant, seule partie qui varie réellement d'une
 * liste à l'autre. itemsOrFetcher accepte aussi bien un tableau direct
 * (données déjà en mémoire, comme le store) qu'une fonction renvoyant une
 * Promise (appel à l'API).
 */
// Garde-fou "dernier appel gagne" (même motif que recomputeSeq dans
// route-controller.js), par conteneur : deux rafraîchissements rapprochés
// du même panneau (ex. marquer un favori puis en supprimer un autre) qui
// résolvent dans le désordre ne doivent pas laisser le résultat périmé
// écraser le plus récent.
const _sequences = new Map();

export async function renderListPanel(containerId, itemsOrFetcher, { renderLabel, renderActions, onData } = {}) {
  const listEl = document.getElementById(containerId);
  const seq = (_sequences.get(containerId) ?? 0) + 1;
  _sequences.set(containerId, seq);

  let items;
  if (typeof itemsOrFetcher === "function") {
    try {
      items = await itemsOrFetcher();
    } catch (err) {
      if (_sequences.get(containerId) !== seq) return;
      showRouteError(err.message);
      return;
    }
    if (_sequences.get(containerId) !== seq) return;
  } else {
    items = itemsOrFetcher;
  }
  onData?.(items);

  listEl.innerHTML = "";
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.appendChild(renderLabel(item, index));

    if (renderActions) {
      const actions = document.createElement("span");
      for (const action of renderActions(item, index)) {
        actions.appendChild(action);
      }
      li.appendChild(actions);
    }

    listEl.appendChild(li);
  });
}
