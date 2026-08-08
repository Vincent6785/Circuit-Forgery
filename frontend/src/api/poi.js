async function handle(res) {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Erreur API (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function listPOI() {
  return fetch("/api/poi").then(handle);
}

export function createPOI(poi) {
  return fetch("/api/poi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(poi),
  }).then(handle);
}

export function deletePOI(id) {
  return fetch(`/api/poi/${id}`, { method: "DELETE" }).then(handle);
}
