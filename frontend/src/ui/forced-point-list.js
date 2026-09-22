import { renderListPanel } from "./list-panel.js";

/** Liste des points de passage imposés à la prochaine génération de circuit
 * (onglet Boucle). Numérotés dans l'ordre où ils seront traversés — le même
 * que celui des pastilles sur la carte (map/forced-point-layer.js). */
export function renderForcedPointList(points, onRemove) {
  return renderListPanel("round-trip-forced-point-list", points, {
    renderLabel: (point, index) => {
      const label = document.createElement("span");
      label.className = "list-item-label";
      label.textContent = `${index + 1}. ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
      return label;
    },
    renderActions: (point, index) => [_deleteButton(index, onRemove)],
  });
}

function _deleteButton(index, onRemove) {
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.textContent = "✕";
  delBtn.title = "Retirer ce point de passage";
  delBtn.setAttribute("aria-label", `Retirer le point de passage ${index + 1}`);
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRemove(index);
  });
  return delBtn;
}
