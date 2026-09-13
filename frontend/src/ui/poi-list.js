import { deletePOI, listPOI } from "../api/poi.js";
import { categoryEmoji } from "../map/poi-layer.js";
import { withInlineConfirmation } from "./confirm-button.js";
import { showRouteError } from "./sidebar.js";
import { listItemButton, renderListPanel } from "./list-panel.js";

export function refreshPoiList(onSelect, onData) {
  return renderListPanel("poi-list", (signal) => listPOI({ signal }), {
    renderLabel: (poi) => listItemButton(`${categoryEmoji(poi.category)} ${poi.name}`, { onClick: () => onSelect(poi) }),
    renderActions: (poi) => [_deleteButton(poi, onSelect, onData)],
    onData,
  });
}

function _deleteButton(poi, onSelect, onData) {
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.dataset.action = "delete";
  delBtn.textContent = "✕";
  delBtn.title = "Supprimer";
  delBtn.setAttribute("aria-label", `Supprimer le point d'intérêt "${poi.name}"`);
  withInlineConfirmation(delBtn, {
    confirmLabel: "Supprimer ?",
    confirmAriaLabel: `Confirmer la suppression définitive du point d'intérêt "${poi.name}"`,
    onConfirm: async () => {
      delBtn.disabled = true;
      try {
        await deletePOI(poi.id);
        refreshPoiList(onSelect, onData);
      } catch (err) {
        delBtn.disabled = false;
        showRouteError(err.message);
      }
    },
  });
  return delBtn;
}
