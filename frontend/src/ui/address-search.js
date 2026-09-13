import { searchAddress } from "../api/geocode.js";
import { createLatestRequest } from "../api/latest-request.js";
import { showRouteError } from "./sidebar.js";

const DEBOUNCE_MS = 350;
// Aligné sur min_length de GET /api/geocode (backend/app/routers/geocode.py).
export const MIN_QUERY_LENGTH = 3;

/**
 * Champ de recherche d'adresse avec suggestions, suivant le motif ARIA
 * "combobox" : ↑/↓ parcourent les suggestions, Entrée choisit la suggestion
 * active (la première à défaut), Échap ferme la liste, ou appelle onCancel si
 * elle est déjà fermée.
 *
 * onSelect(lat, lon, label) est appelé au choix d'une suggestion, après avoir
 * vidé le champ. Renvoie { close } pour fermer la liste depuis l'extérieur.
 * Les libellés viennent d'un service tiers : ils ne sont insérés qu'en
 * textContent.
 */
export function initAddressSearch({ input, results, onSelect, onCancel }) {
  let debounceTimer = null;
  const request = createLatestRequest();
  let items = [];
  let activeIndex = -1;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", results.id);
  input.setAttribute("aria-expanded", "false");
  results.setAttribute("role", "listbox");

  function close() {
    clearTimeout(debounceTimer);
    // Annule aussi une recherche déjà en vol : sa réponse ne doit pas
    // rouvrir la liste après coup.
    request.cancel();
    items = [];
    activeIndex = -1;
    results.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function setActive(index) {
    activeIndex = index;
    [...results.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
    const active = results.children[index];
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function select(index) {
    const item = items[index];
    if (!item) return;
    close();
    input.value = "";
    onSelect(item.lat, item.lon, item.label);
  }

  function render(found) {
    items = found;
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    results.replaceChildren(
      ...found.map((item, i) => {
        const li = document.createElement("li");
        li.id = `${results.id}-option-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.textContent = item.label;
        li.addEventListener("click", () => select(i));
        return li;
      })
    );
    input.setAttribute("aria-expanded", String(found.length > 0));
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      close();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      let result;
      try {
        result = await request.run((signal) => searchAddress(query, { signal }));
      } catch (err) {
        showRouteError(err.message);
        return;
      }
      // Une frappe plus récente a déjà lancé (et annulé celle-ci) une recherche plus fraîche.
      if (!result.stale) render(result.value);
    }, DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
        if (items.length === 0) return;
        e.preventDefault();
        setActive((activeIndex + 1) % items.length);
        break;
      case "ArrowUp":
        if (items.length === 0) return;
        e.preventDefault();
        setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
        break;
      case "Enter":
        if (items.length === 0) return;
        e.preventDefault();
        select(activeIndex >= 0 ? activeIndex : 0);
        break;
      case "Escape":
        if (items.length > 0) {
          e.stopPropagation();
          close();
        } else {
          onCancel?.();
        }
        break;
    }
  });

  // Garde le focus dans le champ pendant un clic sur une suggestion : sans
  // ça, le blur ci-dessous fermerait la liste avant que le clic n'arrive.
  results.addEventListener("mousedown", (e) => e.preventDefault());
  input.addEventListener("blur", close);

  return { close };
}
