import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStore } from "../../src/state/store.js";
import { initDraftAutosave } from "../../src/state/draft-autosave.js";

const DEBOUNCE_MS = 800;

let store;
let saved;
let autosave;

beforeEach(() => {
  vi.useFakeTimers();
  store = createStore({ waypoints: [], computedRoute: null, editingRouteId: null, pendingForcedPoints: [] });
  saved = [];
  autosave = initDraftAutosave(store, { debounceMs: DEBOUNCE_MS, save: (state) => saved.push(state) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("initDraftAutosave", () => {
  it("sauvegarde une mutation utilisateur après le délai", () => {
    store.setState({ waypoints: [{ id: 1 }] }, { userChange: true });
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(saved).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(saved).toHaveLength(1);
    expect(saved[0].waypoints).toEqual([{ id: 1 }]);
  });

  it("écrit l'état courant, pas celui de la mutation (tracé arrivé entre-temps)", () => {
    store.setState({ waypoints: [{ id: 1 }, { id: 2 }] }, { userChange: true });
    store.setState({ computedRoute: { distance_m: 42 } });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(saved).toHaveLength(1);
    expect(saved[0].computedRoute).toEqual({ distance_m: 42 });
  });

  it("re-sauvegarde un tracé calculé après l'écriture précédente", () => {
    store.setState({ waypoints: [{ id: 1 }, { id: 2 }] }, { userChange: true });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    store.setState({ computedRoute: { distance_m: 42 } });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(saved).toHaveLength(2);
    expect(saved[1].computedRoute).toEqual({ distance_m: 42 });
  });

  it("ignore les changements silencieux tant qu'aucune mutation n'est en attente", () => {
    store.setState({ computedRoute: { distance_m: 1 }, editingRouteId: 3 });
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(saved).toHaveLength(0);
  });

  it("ne relance pas la sauvegarde pour une clé silencieuse non suivie", () => {
    store.setState({ waypoints: [{ id: 1 }] }, { userChange: true });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    store.setState({ pendingForcedPoints: [{ lat: 1, lon: 2 }] });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(saved).toHaveLength(1);
  });

  it("cancel abandonne l'écriture programmée et le brouillon en attente", () => {
    store.setState({ waypoints: [{ id: 1 }] }, { userChange: true });
    autosave.cancel();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    store.setState({ computedRoute: { distance_m: 1 } });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(saved).toHaveLength(0);
  });

  it("flush écrit immédiatement une mutation en attente, et rien sinon", () => {
    autosave.flush();
    expect(saved).toHaveLength(0);

    store.setState({ waypoints: [{ id: 1 }] }, { userChange: true });
    autosave.flush();
    expect(saved).toHaveLength(1);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(saved).toHaveLength(1);
  });
});
