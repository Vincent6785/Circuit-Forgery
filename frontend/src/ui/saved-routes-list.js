import { deleteRoute, listRouteSummaries, updateRoute } from "../api/saved-routes.js";
import { exportGpxUrl } from "../api/gpx.js";
import { showRouteError } from "./sidebar.js";
import { listItemButton, renderListPanel } from "./list-panel.js";
import { withInlineConfirmation } from "./confirm-button.js";

/** Les éléments listés sont des résumés (sans points ni géométrie) : les
 * gestionnaires chargent eux-mêmes le détail du trajet ouvert.
 *
 * handlers : { onSelect, onEdit, onDuplicate, onDeleted } — onDeleted(route)
 * est appelé après une suppression réussie, pour que l'éditeur sorte du mode
 * modification si c'est le trajet en cours qui vient d'être supprimé. */
export function refreshSavedRoutesList(handlers) {
  return renderListPanel("saved-routes-list", (signal) => _listRoutesFavoritesFirst(signal), {
    renderLabel: (route) => _label(route, handlers.onSelect),
    renderActions: (route) => [
      _editButton(route, handlers.onEdit),
      _duplicateButton(route, handlers.onDuplicate),
      _exportLink(route),
      _favoriteButton(route, handlers),
      _deleteButton(route, handlers),
    ],
  });
}

/** Les favoris remontent en tête de liste. Tri stable (garanti par le moteur
 * JS) : l'ordre created_at DESC déjà renvoyé par l'API est préservé au sein
 * de chaque groupe favori/non-favori, sans avoir à le recalculer ici. */
async function _listRoutesFavoritesFirst(signal) {
  const routes = await listRouteSummaries({ signal });
  return [...routes].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite));
}

function _label(route, onSelect) {
  return listItemButton(`${route.is_favorite ? "★ " : ""}${route.name} (${(route.distance_m / 1000).toFixed(1)} km)`, {
    title: route.description || undefined,
    onClick: () => onSelect(route),
  });
}

function _editButton(route, onEdit) {
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "✎";
  editBtn.title = "Modifier ce trajet";
  editBtn.setAttribute("aria-label", `Modifier le trajet "${route.name}"`);
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onEdit?.(route);
  });
  return editBtn;
}

function _duplicateButton(route, onDuplicate) {
  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.textContent = "⎘";
  dupBtn.title = "Dupliquer ce trajet";
  dupBtn.setAttribute("aria-label", `Dupliquer le trajet "${route.name}"`);
  dupBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDuplicate?.(route);
  });
  return dupBtn;
}

function _exportLink(route) {
  const exportLink = document.createElement("a");
  exportLink.textContent = "⬇";
  exportLink.title = "Exporter en GPX";
  exportLink.setAttribute("aria-label", `Exporter le trajet "${route.name}" en GPX`);
  exportLink.href = exportGpxUrl(route.id);
  exportLink.download = `${route.name}.gpx`;
  exportLink.addEventListener("click", (e) => e.stopPropagation());
  return exportLink;
}

function _favoriteButton(route, handlers) {
  const favBtn = document.createElement("button");
  favBtn.type = "button";
  favBtn.textContent = route.is_favorite ? "☆" : "★";
  favBtn.title = "Basculer favori";
  favBtn.setAttribute(
    "aria-label",
    route.is_favorite ? `Retirer "${route.name}" des favoris` : `Ajouter "${route.name}" aux favoris`
  );
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    // Un double clic enverrait sinon deux fois la même bascule, calculée
    // depuis la même valeur is_favorite périmée.
    favBtn.disabled = true;
    try {
      await updateRoute(route.id, { is_favorite: !route.is_favorite });
      refreshSavedRoutesList(handlers);
    } catch (err) {
      favBtn.disabled = false;
      showRouteError(err.message);
    }
  });
  return favBtn;
}

function _deleteButton(route, handlers) {
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.dataset.action = "delete";
  delBtn.textContent = "✕";
  delBtn.title = "Supprimer";
  delBtn.setAttribute("aria-label", `Supprimer le trajet "${route.name}"`);
  withInlineConfirmation(delBtn, {
    confirmLabel: "Supprimer ?",
    confirmAriaLabel: `Confirmer la suppression définitive du trajet "${route.name}"`,
    onConfirm: async () => {
      delBtn.disabled = true;
      try {
        await deleteRoute(route.id);
        handlers.onDeleted?.(route);
        refreshSavedRoutesList(handlers);
      } catch (err) {
        delBtn.disabled = false;
        showRouteError(err.message);
      }
    },
  });
  return delBtn;
}
