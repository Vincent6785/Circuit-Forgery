export async function searchAddress(query) {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Erreur de recherche d'adresse (${res.status})`);
  }
  return res.json();
}
