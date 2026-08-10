import { renderListPanel } from "./list-panel.js";

export function renderAvoidZoneList(zones, onRemove) {
  return renderListPanel("avoid-zone-list", zones, {
    renderLabel: (zone) => {
      const label = document.createElement("span");
      label.className = "list-item-label";
      label.textContent = `Zone (${Math.round(zone.radiusM)} m) — ${zone.lat.toFixed(4)}, ${zone.lon.toFixed(4)}`;
      return label;
    },
    renderActions: (zone, index) => [_deleteButton(index, onRemove)],
  });
}

function _deleteButton(index, onRemove) {
  const delBtn = document.createElement("button");
  delBtn.textContent = "✕";
  delBtn.title = "Retirer cette zone";
  delBtn.setAttribute("aria-label", "Retirer cette zone à éviter");
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRemove(index);
  });
  return delBtn;
}
