import { deleteRoute, listRoutes, updateRoute } from "../api/saved-routes.js";
import { exportGpxUrl } from "../api/gpx.js";
import { showRouteError } from "./sidebar.js";
import { renderListPanel } from "./list-panel.js";

export function refreshSavedRoutesList(onSelect, onEdit, onDuplicate) {
  return renderListPanel("saved-routes-list", _listRoutesFavoritesFirst, {
    renderLabel: (route) => _label(route, onSelect),
    renderActions: (route) => [
      _editButton(route, onEdit),
      _duplicateButton(route, onDuplicate),
      _exportLink(route),
      _favoriteButton(route, onSelect, onEdit, onDuplicate),
      _deleteButton(route, onSelect, onEdit, onDuplicate),
    ],
  });
}

/** Les favoris remontent en tête de liste. Tri stable (garanti par le moteur
 * JS) : l'ordre created_at DESC déjà renvoyé par l'API est préservé au sein
 * de chaque groupe favori/non-favori, sans avoir à le recalculer ici. */
async function _listRoutesFavoritesFirst() {
  const routes = await listRoutes();
  return [...routes].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite));
}

function _label(route, onSelect) {
  const label = document.createElement("span");
  label.textContent = `${route.is_favorite ? "★ " : ""}${route.name} (${(route.distance_m / 1000).toFixed(1)} km)`;
  if (route.description) label.title = route.description;
  label.addEventListener("click", () => onSelect(route));
  return label;
}

function _editButton(route, onEdit) {
  const editBtn = document.createElement("button");
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

function _favoriteButton(route, onSelect, onEdit, onDuplicate) {
  const favBtn = document.createElement("button");
  favBtn.textContent = route.is_favorite ? "☆" : "★";
  favBtn.title = "Basculer favori";
  favBtn.setAttribute(
    "aria-label",
    route.is_favorite ? `Retirer "${route.name}" des favoris` : `Ajouter "${route.name}" aux favoris`
  );
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await updateRoute(route.id, { is_favorite: !route.is_favorite });
      refreshSavedRoutesList(onSelect, onEdit, onDuplicate);
    } catch (err) {
      showRouteError(err.message);
    }
  });
  return favBtn;
}

function _deleteButton(route, onSelect, onEdit, onDuplicate) {
  const delBtn = document.createElement("button");
  delBtn.textContent = "✕";
  delBtn.title = "Supprimer";
  delBtn.setAttribute("aria-label", `Supprimer le trajet "${route.name}"`);
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement le trajet "${route.name}" ?`)) return;
    try {
      await deleteRoute(route.id);
      refreshSavedRoutesList(onSelect, onEdit, onDuplicate);
    } catch (err) {
      showRouteError(err.message);
    }
  });
  return delBtn;
}
