import { initAddressSearch } from "../ui/address-search.js";
import { ITINERARY_FIELDS, isFieldEnabled, searchFieldAction, fieldDisplayValue } from "../utils/itinerary.js";

const PLACEHOLDERS = {
  start: { enabled: "Départ : adresse ou clic sur la carte", disabled: "" },
  end: { enabled: "Arrivée : adresse ou clic sur la carte", disabled: "Arrivée : définissez d'abord le départ" },
  step: {
    enabled: "Ajouter une étape : adresse ou clic",
    disabled: "Étape : définissez d'abord départ et arrivée",
  },
};
const MIN_FOCUS_ZOOM = 13;

/** Câble les champs Départ / Arrivée / Étape de l'onglet Itinéraire.
 *
 * Toutes les mutations passent par WaypointManager (editPoint, insertPointAt),
 * exactement comme un clic sur la carte : recalcul, brouillon et
 * annuler/rétablir restent donc cohérents quelle que soit la source. Hors
 * saisie, les champs Départ et Arrivée reflètent le premier et le dernier
 * point du trajet, quelle que soit la façon dont ils ont été posés. */
export function initItineraryController({ map, store, waypointManager }) {
  const fields = ITINERARY_FIELDS.map((name) => {
    const field = { name, input: document.getElementById(`itinerary-${name}-input`) };
    field.search = initAddressSearch({
      input: field.input,
      results: document.getElementById(`itinerary-${name}-results`),
      onSelect: (lat, lon, label) => applySelection(field, lat, lon, label),
      onCancel: () => syncField(field, { force: true }),
    });
    // Une saisie abandonnée ne doit pas laisser croire que le point a changé.
    field.input.addEventListener("blur", () => syncField(field, { force: true }));
    return field;
  });

  function applySelection(field, lat, lon, label) {
    const action = searchFieldAction(waypointManager.getPoints(), field.name, { lat, lon });
    if (!action) return;
    if (action.type === "edit") {
      waypointManager.editPoint(action.id, { lat, lon, label });
    } else {
      waypointManager.insertPointAt(action.index, lat, lon, label);
    }
    syncField(field, { force: true });
    // À partir de deux points, le recalcul recadre déjà la carte sur le
    // tracé (RouteLayer.draw) : un setView ici provoquerait un double saut.
    if (waypointManager.getPoints().length < 2) {
      map.setView([lat, lon], Math.max(map.getZoom(), MIN_FOCUS_ZOOM));
    }
  }

  function syncField(field, { force = false } = {}) {
    const points = store.getState().waypoints;
    const { input } = field;
    const enabled = isFieldEnabled(points, field.name);
    if (input.disabled === enabled) {
      input.disabled = !enabled;
      if (!enabled) field.search.close();
    }
    const placeholder = PLACEHOLDERS[field.name][enabled ? "enabled" : "disabled"];
    if (input.placeholder !== placeholder) input.placeholder = placeholder;

    // Ne réécrit pas une saisie en cours (même garde-fou que
    // speed-limit-controller.js) : un recalcul qui se termine notifie le
    // store sans rapport avec ce que l'utilisateur est en train de taper.
    if (!force && document.activeElement === input) return;
    const value = fieldDisplayValue(points, field.name);
    if (input.value !== value) input.value = value;
    input.title = value;
  }

  store.subscribe(() => fields.forEach((field) => syncField(field)), { keys: ["waypoints"] });
  fields.forEach((field) => syncField(field));
}
