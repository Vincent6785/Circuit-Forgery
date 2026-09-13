import { createLatestRequest } from "../api/latest-request.js";
import { showRouteError } from "./sidebar.js";

/**
 * Squelette commun à toutes les listes de la sidebar (trajets sauvegardés,
 * points d'intérêt, zones à éviter) : récupération des données (erreur
 * affichée dans le bandeau générique en cas d'échec, pertinent seulement si
 * itemsOrFetcher est une fonction async), puis vidage et repeuplement d'un
 * <ul> avec un <li> par élément — libellé et actions (boutons ou liens)
 * fournis par l'appelant, seule partie qui varie réellement d'une liste à
 * l'autre. itemsOrFetcher accepte aussi bien un tableau direct (données déjà
 * en mémoire, comme le store) qu'une fonction recevant un AbortSignal et
 * renvoyant une Promise (appel à l'API).
 */
// "Dernier appel gagne" par conteneur : deux rafraîchissements rapprochés du
// même panneau (ex. marquer un favori puis en supprimer un autre) annulent la
// requête précédente, dont le résultat périmé ne peut plus écraser le plus
// récent.
const _requests = new Map();

export async function renderListPanel(containerId, itemsOrFetcher, { renderLabel, renderActions, onData } = {}) {
  const listEl = document.getElementById(containerId);

  let items;
  if (typeof itemsOrFetcher === "function") {
    if (!_requests.has(containerId)) _requests.set(containerId, createLatestRequest());
    let result;
    try {
      result = await _requests.get(containerId).run((signal) => itemsOrFetcher(signal));
    } catch (err) {
      showRouteError(err.message);
      return;
    }
    if (result.stale) return;
    items = result.value;
  } else {
    items = itemsOrFetcher;
  }
  onData?.(items);

  listEl.replaceChildren(
    ...items.map((item, index) => {
      const li = document.createElement("li");
      li.appendChild(renderLabel(item, index));
      if (renderActions) {
        const actions = document.createElement("span");
        actions.append(...renderActions(item, index));
        li.appendChild(actions);
      }
      return li;
    })
  );
}

/** Libellé cliquable d'une liste : un vrai bouton, atteignable au clavier
 * (un <span> cliquable ne l'était pas). */
export function listItemButton(text, { title, onClick } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-item-label";
  button.textContent = text;
  if (title) button.title = title;
  if (onClick) button.addEventListener("click", onClick);
  return button;
}
