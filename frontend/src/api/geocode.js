import { apiFetch } from "./http.js";

export function searchAddress(query) {
  return apiFetch(`/api/geocode?q=${encodeURIComponent(query)}`, {}, "Erreur de recherche d'adresse");
}
