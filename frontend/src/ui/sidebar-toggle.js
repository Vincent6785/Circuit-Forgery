const COLLAPSED_CLASS = "sidebar-collapsed";

/** Petits écrans : replie le panneau latéral pour laisser toute la hauteur à
 * la carte (le bouton n'est affiché que sous 768 px, cf. style.css).
 * Choisir un onglet réaffiche le panneau. */
export function initSidebarToggle({ map }) {
  const app = document.getElementById("app");
  const button = document.getElementById("sidebar-toggle");

  function setCollapsed(collapsed) {
    app.classList.toggle(COLLAPSED_CLASS, collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.textContent = collapsed ? "Afficher le panneau" : "Agrandir la carte";
  }

  // La carte change de taille — panneau replié ou déplié, mais aussi message
  // d'erreur affiché sous le panneau replié : Leaflet doit recalculer sa zone
  // d'affichage, sans quoi des tuiles manquent et les clics tombent au mauvais
  // endroit.
  new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer());

  button.addEventListener("click", () => setCollapsed(!app.classList.contains(COLLAPSED_CLASS)));
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener("click", () => {
      if (app.classList.contains(COLLAPSED_CLASS)) setCollapsed(false);
    });
  }
}
