import { roleForIndex } from "../map/waypoint-role.js";

// État d'édition inline, gardé au niveau du module plutôt que dans le store :
// purement transitoire, aucune mutation tant que l'édition n'est pas
// validée. Les derniers arguments reçus sont conservés pour permettre un
// re-rendu autonome, sans passer par une notification du store — ouvrir ou
// fermer l'édition ne doit pas déclencher de recalcul.
let _editingId = null;
let _lastArgs = null;

function _rerender() {
  if (_lastArgs) renderWaypointList(..._lastArgs);
}

function _legDistanceM(idx, computedRoute) {
  const boundaries = computedRoute?.leg_boundaries;
  const cumulative = computedRoute?.cumulative_distance_m;
  if (!boundaries || !cumulative || boundaries.length <= idx || idx === 0) return null;
  const from = cumulative[boundaries[idx - 1]];
  const to = cumulative[boundaries[idx]];
  if (from == null || to == null) return null;
  return to - from;
}

/**
 * Liste réordonnable (glisser-déposer HTML5 natif) des waypoints du trajet
 * en cours d'édition. waypointManager expose les mutations (removePoint,
 * reorder, renamePoint, updatePoint) déclenchées depuis la liste.
 * computedRoute, optionnel, fournit leg_boundaries et cumulative_distance_m
 * pour afficher la distance depuis l'étape précédente.
 */
export function renderWaypointList(waypoints, waypointManager, computedRoute) {
  _lastArgs = [waypoints, waypointManager, computedRoute];
  const container = document.getElementById("waypoint-list");
  container.innerHTML = "";

  waypoints.forEach((wp, idx) => {
    const { label: roleLabel, color } = roleForIndex(idx, waypoints.length);
    const displayLabel = wp.label || roleLabel;

    const li = document.createElement("li");
    li.className = "waypoint-item";
    li.draggable = _editingId === null;
    li.dataset.index = String(idx);

    const dot = document.createElement("span");
    dot.className = "waypoint-dot";
    dot.style.background = color;
    li.appendChild(dot);

    if (_editingId === wp.id) {
      li.appendChild(_editForm(wp, waypointManager));
    } else {
      const text = document.createElement("span");
      text.className = "waypoint-label";
      const legDistance = _legDistanceM(idx, computedRoute);
      const distanceSuffix = legDistance != null ? ` (+${(legDistance / 1000).toFixed(1)} km)` : "";
      text.textContent = `${displayLabel} — ${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}${distanceSuffix}`;
      text.title = "Cliquer pour modifier le nom et les coordonnées";
      text.addEventListener("click", () => {
        _editingId = wp.id;
        _rerender();
      });
      li.appendChild(text);
    }

    // Boutons ▲▼ : alternative accessible au glisser-déposer HTML5 natif, qui
    // ne fonctionne ni au tactile ni au clavier (pas d'événement
    // dragstart/dragover sur mobile).
    const upBtn = document.createElement("button");
    upBtn.textContent = "▲";
    upBtn.title = "Déplacer vers le haut";
    upBtn.setAttribute("aria-label", `Déplacer "${displayLabel}" vers le haut`);
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      waypointManager.reorder(idx, idx - 1);
    });
    li.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.textContent = "▼";
    downBtn.title = "Déplacer vers le bas";
    downBtn.setAttribute("aria-label", `Déplacer "${displayLabel}" vers le bas`);
    downBtn.disabled = idx === waypoints.length - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      waypointManager.reorder(idx, idx + 1);
    });
    li.appendChild(downBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Supprimer ce point";
    delBtn.setAttribute("aria-label", `Supprimer "${displayLabel}"`);
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      waypointManager.removePoint(wp.id);
    });
    li.appendChild(delBtn);

    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(idx));
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromIndex = Number(e.dataTransfer.getData("text/plain"));
      const toIndex = Number(li.dataset.index);
      waypointManager.reorder(fromIndex, toIndex);
    });

    container.appendChild(li);
  });
}

function _editForm(wp, waypointManager) {
  const form = document.createElement("span");
  form.className = "waypoint-edit-form";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = wp.label || "";
  nameInput.placeholder = "Nom (optionnel)";
  nameInput.setAttribute("aria-label", "Nom du point");

  const latInput = document.createElement("input");
  latInput.type = "number";
  latInput.step = "0.000001";
  latInput.value = wp.lat;
  latInput.setAttribute("aria-label", "Latitude");

  const lonInput = document.createElement("input");
  lonInput.type = "number";
  lonInput.step = "0.000001";
  lonInput.value = wp.lon;
  lonInput.setAttribute("aria-label", "Longitude");

  function commit() {
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    const label = nameInput.value.trim();
    _editingId = null;

    const latChanged = Number.isFinite(lat) && lat !== wp.lat;
    const lonChanged = Number.isFinite(lon) && lon !== wp.lon;
    const labelChanged = label !== (wp.label || "");

    if (latChanged || lonChanged || labelChanged) {
      waypointManager.editPoint(wp.id, {
        lat: latChanged ? lat : undefined,
        lon: lonChanged ? lon : undefined,
        label: labelChanged ? label : undefined,
      });
    } else {
      _rerender();
    }
  }

  function cancel() {
    _editingId = null;
    _rerender();
  }

  for (const input of [nameInput, latInput, lonInput]) {
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commit();
      if (e.key === "Escape") cancel();
    });
  }

  form.appendChild(nameInput);
  form.appendChild(latInput);
  form.appendChild(lonInput);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "✓";
  okBtn.title = "Valider";
  okBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    commit();
  });
  form.appendChild(okBtn);

  return form;
}
