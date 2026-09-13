import { describe, it, expect, vi, afterEach } from "vitest";
import { saveDraft, loadDraft, clearDraft, serializeDraft } from "../../src/state/draft-storage.js";

const KEY = "circuit-forgery:draft:v1";

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
    setItem: vi.fn((key, value) => data.set(key, value)),
    removeItem: vi.fn((key) => data.delete(key)),
  };
}

const STATE = {
  waypoints: [{ id: 1, lat: 48.85, lon: 2.35, label: null }],
  computedRoute: { distance_m: 1000, geometry_geojson: { type: "LineString", coordinates: [] } },
  avoidZones: [],
  speedLimitKmh: 60,
  noSpeedLimit: false,
  pendingForcedPoint: null,
  roundTripVariant: null,
  editingRouteId: 12,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("serializeDraft", () => {
  it("inclut le trajet en cours de modification", () => {
    const draft = serializeDraft(STATE);
    expect(draft.editingRouteId).toBe(12);
    expect(draft.speedLimitKmh).toBe(60);
    expect(typeof draft.savedAt).toBe("string");
  });
});

describe("saveDraft / loadDraft / clearDraft", () => {
  it("fait l'aller-retour d'un brouillon", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(saveDraft(STATE)).toBe(true);
    expect(loadDraft()).toMatchObject({ waypoints: STATE.waypoints, editingRouteId: 12 });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("retente sans le tracé calculé quand le quota est dépassé", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.stubGlobal("localStorage", storage);

    expect(saveDraft(STATE)).toBe(true);
    const saved = JSON.parse(storage.data.get(KEY));
    expect(saved.computedRoute).toBeNull();
    expect(saved.waypoints).toEqual(STATE.waypoints);
  });

  it("renvoie false sans lever d'exception si l'écriture échoue toujours", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.stubGlobal("localStorage", storage);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(saveDraft(STATE)).toBe(false);
  });

  it("ignore un brouillon illisible ou mal formé", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    storage.data.set(KEY, "{pas du json");
    expect(loadDraft()).toBeNull();
    storage.data.set(KEY, JSON.stringify({ waypoints: "pas un tableau" }));
    expect(loadDraft()).toBeNull();
    storage.data.set(KEY, "null");
    expect(loadDraft()).toBeNull();
  });

  it("reste utilisable quand l'accès au stockage lui-même est refusé", () => {
    vi.stubGlobal("localStorage", undefined);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    try {
      expect(saveDraft(STATE)).toBe(false);
      expect(loadDraft()).toBeNull();
      expect(() => clearDraft()).not.toThrow();
    } finally {
      delete globalThis.localStorage;
    }
  });

  it("reste utilisable quand chaque opération du stockage lève une exception", () => {
    const failing = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
      removeItem: () => {
        throw new Error("boom");
      },
    };
    vi.stubGlobal("localStorage", failing);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(saveDraft(STATE)).toBe(false);
    expect(loadDraft()).toBeNull();
    expect(() => clearDraft()).not.toThrow();
  });
});
