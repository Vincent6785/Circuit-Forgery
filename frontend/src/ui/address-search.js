import { searchAddress } from "../api/geocode.js";

const DEBOUNCE_MS = 350;

/** onSelect(lat, lon, label) est appelé au clic sur un résultat. */
export function initAddressSearch(onSelect) {
  const input = document.getElementById("address-search-input");
  const results = document.getElementById("address-search-results");
  let debounceTimer = null;
  let requestSeq = 0;

  function clearResults() {
    results.innerHTML = "";
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 3) {
      clearResults();
      return;
    }
    debounceTimer = setTimeout(async () => {
      const seq = ++requestSeq;
      let items;
      try {
        items = await searchAddress(query);
      } catch {
        return;
      }
      if (seq !== requestSeq) return; // une frappe plus récente a déjà relancé une recherche
      renderResults(items);
    }, DEBOUNCE_MS);
  });

  function renderResults(items) {
    clearResults();
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item.label;
      li.addEventListener("click", () => {
        onSelect(item.lat, item.lon, item.label);
        input.value = "";
        clearResults();
      });
      results.appendChild(li);
    }
  }
}
