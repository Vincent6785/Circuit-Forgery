import { describe, it, expect, vi } from "vitest";
import {
  TABS,
  DEFAULT_TAB,
  readStoredTab,
  writeStoredTab,
  isVisibleForTab,
  tabIndexForKey,
} from "../../src/ui/tabs.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: vi.fn((key) => (key in data ? data[key] : null)),
    setItem: vi.fn((key, value) => {
      data[key] = value;
    }),
  };
}

describe("readStoredTab / writeStoredTab", () => {
  it("relit l'onglet mémorisé", () => {
    const storage = memoryStorage();
    writeStoredTab(() => storage, "saved");
    expect(readStoredTab(() => storage)).toBe("saved");
  });

  it("revient à l'onglet par défaut pour une valeur absente ou inconnue", () => {
    expect(readStoredTab(() => memoryStorage())).toBe(DEFAULT_TAB);
    expect(readStoredTab(() => memoryStorage({ "circuit-forgery:tab:v1": "<script>" }))).toBe(DEFAULT_TAB);
  });

  it("tolère un stockage absent ou inaccessible", () => {
    expect(readStoredTab(() => null)).toBe(DEFAULT_TAB);
    expect(
      readStoredTab(() => {
        throw new Error("SecurityError");
      })
    ).toBe(DEFAULT_TAB);
    expect(() =>
      writeStoredTab(
        () => ({
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        }),
        "loop"
      )
    ).not.toThrow();
  });
});

describe("isVisibleForTab", () => {
  it.each([
    ["route loop", "loop", true],
    ["route loop", "saved", false],
    ["saved", "saved", true],
    ["  route   loop ", "route", true],
    [undefined, "route", false],
    ["", "route", false],
  ])("data-tabs=%j, onglet %s -> %s", (dataTabs, tab, expected) => {
    expect(isVisibleForTab(dataTabs, tab)).toBe(expected);
  });
});

describe("tabIndexForKey", () => {
  const count = TABS.length;

  it("les flèches parcourent les onglets en boucle", () => {
    expect(tabIndexForKey("ArrowRight", 0, count)).toBe(1);
    expect(tabIndexForKey("ArrowRight", count - 1, count)).toBe(0);
    expect(tabIndexForKey("ArrowLeft", 0, count)).toBe(count - 1);
  });

  it("Début et Fin vont aux extrémités", () => {
    expect(tabIndexForKey("Home", 2, count)).toBe(0);
    expect(tabIndexForKey("End", 0, count)).toBe(count - 1);
  });

  it("ignore les autres touches", () => {
    expect(tabIndexForKey("Enter", 0, count)).toBeNull();
  });
});
