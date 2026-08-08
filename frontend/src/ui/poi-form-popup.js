import L from "leaflet";
import { POI_CATEGORIES } from "../map/poi-layer.js";

/** Ouvre un formulaire, sous forme de popup Leaflet, pour créer un POI à
 * l'endroit cliqué. onSubmit({name, lat, lon, category, notes}) est appelé
 * une fois le formulaire validé. */
export function openPoiCreationPopup(map, latlng, onSubmit) {
  const container = document.createElement("div");
  container.className = "poi-form-popup";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Nom du point d'intérêt";
  nameInput.required = true;
  container.appendChild(nameInput);

  const categorySelect = document.createElement("select");
  for (const { value, label } of POI_CATEGORIES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    categorySelect.appendChild(option);
  }
  container.appendChild(categorySelect);

  const notesInput = document.createElement("textarea");
  notesInput.placeholder = "Notes (optionnel)";
  notesInput.rows = 2;
  container.appendChild(notesInput);

  const submitBtn = document.createElement("button");
  submitBtn.textContent = "Ajouter ce point";
  container.appendChild(submitBtn);

  const popup = L.popup({ closeOnClick: false })
    .setLatLng(latlng)
    .setContent(container)
    .openOn(map);

  submitBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    onSubmit({
      name,
      lat: latlng.lat,
      lon: latlng.lng,
      category: categorySelect.value,
      notes: notesInput.value.trim() || null,
    });
    map.closePopup(popup);
  });

  nameInput.focus();
}
