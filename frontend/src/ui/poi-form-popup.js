import L from "leaflet";
import { POI_CATEGORIES } from "../map/poi-layer.js";

/** Ouvre un formulaire, sous forme de popup Leaflet, pour créer un POI à
 * l'endroit cliqué. onSubmit({name, lat, lon, category, notes}) renvoie une
 * Promise : le popup ne se ferme qu'une fois l'enregistrement réussi, et
 * affiche l'erreur sinon — la saisie n'est plus perdue en cas d'échec.
 * Entrée valide le formulaire. */
export function openPoiCreationPopup(map, latlng, onSubmit) {
  const form = document.createElement("form");
  form.className = "poi-form-popup";
  form.noValidate = true;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Nom du point d'intérêt";
  nameInput.maxLength = 200;
  nameInput.setAttribute("aria-label", "Nom du point d'intérêt");
  form.appendChild(nameInput);

  const categorySelect = document.createElement("select");
  categorySelect.setAttribute("aria-label", "Catégorie");
  for (const { value, label } of POI_CATEGORIES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    categorySelect.appendChild(option);
  }
  form.appendChild(categorySelect);

  const notesInput = document.createElement("textarea");
  notesInput.placeholder = "Notes (optionnel)";
  notesInput.rows = 2;
  notesInput.maxLength = 2000;
  notesInput.setAttribute("aria-label", "Notes");
  form.appendChild(notesInput);

  const errorEl = document.createElement("p");
  errorEl.className = "poi-form-error";
  errorEl.setAttribute("role", "alert");
  errorEl.hidden = true;
  form.appendChild(errorEl);

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.textContent = "Ajouter ce point";
  form.appendChild(submitBtn);

  const popup = L.popup({ closeOnClick: false }).setLatLng(latlng).setContent(form).openOn(map);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    submitBtn.disabled = true;
    errorEl.hidden = true;
    try {
      await onSubmit({
        name,
        lat: latlng.lat,
        lon: latlng.lng,
        category: categorySelect.value,
        notes: notesInput.value.trim() || null,
      });
      map.closePopup(popup);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });

  nameInput.focus();
}
