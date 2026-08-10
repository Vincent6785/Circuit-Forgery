const DRAFT_KEY = "circuit-forgery:draft:v1";

export function saveDraft(state) {
  const draft = {
    waypoints: state.waypoints,
    computedRoute: state.computedRoute,
    avoidZones: state.avoidZones,
    speedLimitKmh: state.speedLimitKmh,
    noSpeedLimit: state.noSpeedLimit,
    pendingForcedPoint: state.pendingForcedPoint,
    roundTripVariant: state.roundTripVariant,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Brouillon local illisible, ignoré :", err);
    return null;
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
