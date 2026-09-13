/** Onglets de la sidebar (Itinéraire, Boucle, Mes trajets).
 *
 * Tout élément portant `data-tabs="…"` (liste d'onglets séparés par des
 * espaces) n'est affiché que pour ces onglets : une même section (options,
 * liste des points) peut ainsi être partagée entre Itinéraire et Boucle sans
 * être dupliquée dans le DOM. Chaque changement d'onglet émet TAB_CHANGE_EVENT
 * sur `document`, pour que les modes "prochain clic sur la carte = …" liés à
 * un onglet (génération de boucle, dessin de zone) se désactivent quand on le
 * quitte. */

export const TABS = ["route", "loop", "saved"];
export const DEFAULT_TAB = "route";
export const TAB_CHANGE_EVENT = "cf:tabchange";
const STORAGE_KEY = "circuit-forgery:tab:v1";

/** Onglet mémorisé, ou l'onglet par défaut si le stockage est absent,
 * inaccessible (navigation privée, stockage bloqué) ou contient une valeur
 * inconnue. getStorage est une fonction car le simple accès à
 * window.localStorage peut lever une exception. */
export function readStoredTab(getStorage) {
  try {
    const value = getStorage()?.getItem(STORAGE_KEY);
    return TABS.includes(value) ? value : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

export function writeStoredTab(getStorage, tab) {
  try {
    getStorage()?.setItem(STORAGE_KEY, tab);
  } catch {
    // Stockage indisponible ou plein : l'onglet n'est simplement pas mémorisé.
  }
}

export function isVisibleForTab(dataTabs, tab) {
  return (dataTabs ?? "").split(/\s+/).includes(tab);
}

/** Navigation clavier du motif ARIA "tabs" : index de l'onglet à activer pour
 * une touche donnée, ou null si la touche ne concerne pas les onglets. */
export function tabIndexForKey(key, currentIndex, count) {
  switch (key) {
    case "ArrowRight":
      return (currentIndex + 1) % count;
    case "ArrowLeft":
      return (currentIndex - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

let _activate = null;

export function initTabs({ getStorage = () => window.localStorage } = {}) {
  const buttons = [...document.querySelectorAll('[role="tab"][data-tab]')];
  const sections = [...document.querySelectorAll("[data-tabs]")];
  let current = null;

  function activate(tab, { focus = false } = {}) {
    if (!TABS.includes(tab)) return;
    const button = buttons.find((b) => b.dataset.tab === tab);
    if (focus) button?.focus();
    if (tab === current) return;

    const previous = current;
    current = tab;
    for (const b of buttons) {
      const selected = b === button;
      b.setAttribute("aria-selected", String(selected));
      b.tabIndex = selected ? 0 : -1;
    }
    for (const section of sections) {
      section.classList.toggle("hidden", !isVisibleForTab(section.dataset.tabs, tab));
    }
    writeStoredTab(getStorage, tab);
    if (previous !== null) {
      document.dispatchEvent(new CustomEvent(TAB_CHANGE_EVENT, { detail: { tab, previous } }));
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => activate(button.dataset.tab));
    button.addEventListener("keydown", (e) => {
      const index = tabIndexForKey(e.key, buttons.indexOf(button), buttons.length);
      if (index === null) return;
      e.preventDefault();
      activate(buttons[index].dataset.tab, { focus: true });
    });
  }

  activate(readStoredTab(getStorage));
  _activate = activate;
}

/** Bascule sur un onglet par programme (ex. ouverture d'un trajet sauvegardé
 * depuis "Mes trajets"). Sans effet tant que initTabs n'a pas été appelé. */
export function switchTab(tab) {
  _activate?.(tab);
}
