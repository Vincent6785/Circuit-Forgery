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
export async function renderListPanel(containerId, itemsOrFetcher, { renderLabel, renderActions, onData } = {}) {
  const listEl = document.getElementById(containerId);
  listEl.innerHTML = "";

  let items;
  if (typeof itemsOrFetcher === "function") {
    try {
      items = await itemsOrFetcher();
    } catch (err) {
      showRouteError(err.message);
      return;
    }
  } else {
    items = itemsOrFetcher;
  }
  onData?.(items);

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
