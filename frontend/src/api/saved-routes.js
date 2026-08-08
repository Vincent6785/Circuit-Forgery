async function handle(res) {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Erreur API (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function listRoutes() {
  return fetch("/api/routes").then(handle);
}

export function createRoute(route) {
  return fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  }).then(handle);
}

export function updateRoute(id, patch) {
  return fetch(`/api/routes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(handle);
}

export function deleteRoute(id) {
  return fetch(`/api/routes/${id}`, { method: "DELETE" }).then(handle);
}
