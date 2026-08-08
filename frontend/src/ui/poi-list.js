import { deletePOI, listPOI } from "../api/poi.js";
import { showRouteError } from "./sidebar.js";
import { renderListPanel } from "./list-panel.js";

export function refreshPoiList(onSelect, onData) {
  return renderListPanel("poi-list", listPOI, {
    renderLabel: (poi) => _label(poi, onSelect),
    renderActions: (poi) => [_deleteButton(poi, onSelect, onData)],
    onData,
  });
}

function _label(poi, onSelect) {
  const label = document.createElement("span");
  label.textContent = poi.name;
  label.addEventListener("click", () => onSelect(poi));
  return label;
}

function _deleteButton(poi, onSelect, onData) {
  const delBtn = document.createElement("button");
  delBtn.textContent = "✕";
  delBtn.title = "Supprimer";
  delBtn.setAttribute("aria-label", `Supprimer le point d'intérêt "${poi.name}"`);
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement le point d'intérêt "${poi.name}" ?`)) return;
    try {
      await deletePOI(poi.id);
      refreshPoiList(onSelect, onData);
    } catch (err) {
      showRouteError(err.message);
    }
  });
  return delBtn;
}
