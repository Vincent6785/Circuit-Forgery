import { describe, it, expect } from "vitest";
import { haversineMeters, cheapestInsertionIndex } from "../../src/utils/geo.js";

describe("haversineMeters", () => {
  it("distance nulle pour un même point", () => {
    expect(haversineMeters({ lat: 48.85, lon: 2.35 }, { lat: 48.85, lon: 2.35 })).toBe(0);
  });

  it("Paris - Londres ≈ 343,5 km", () => {
    const d = haversineMeters({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 });
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(347_000);
  });

  it("est symétrique", () => {
    const a = { lat: 45.76, lon: 4.84 };
    const b = { lat: 43.3, lon: 5.37 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe("cheapestInsertionIndex", () => {
  const route = [
    { lat: 48.0, lon: 2.0 },
    { lat: 48.0, lon: 3.0 },
    { lat: 49.0, lon: 3.0 },
  ];

  it("choisit la paire qui minimise le détour", () => {
    expect(cheapestInsertionIndex(route, { lat: 48.01, lon: 2.5 })).toBe(0);
    expect(cheapestInsertionIndex(route, { lat: 48.5, lon: 3.01 })).toBe(1);
  });

  it("renvoie 0 faute de paire", () => {
    expect(cheapestInsertionIndex([], { lat: 48, lon: 2 })).toBe(0);
    expect(cheapestInsertionIndex([route[0]], { lat: 48, lon: 2 })).toBe(0);
  });
});
