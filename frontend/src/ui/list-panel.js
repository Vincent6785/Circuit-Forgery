import { showRouteError } from "./sidebar.js";

/**
 * Squelette commun aux listes de la sidebar (trajets sauvegardés, points
 * d'intérêt, zones à éviter) : récupération des données (erreur affichée
 * dans le bandeau générique en cas d'échec — uniquement pertinent si
 * itemsOrFetcher est une fonction async), vidage + repeuplement d'un <ul>,
 * un <li> par élément avec un libellé cliquable et des actions (boutons/
 * liens) fournies par l'appelant — seule cette partie diffère réellement
 * entre les listes. itemsOrFetcher peut être un tableau direct (données déjà
 * en mémoire, ex. le store) ou une fonction retournant une Promise (fetch API).
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
