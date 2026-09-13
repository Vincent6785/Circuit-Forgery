import { describe, it, expect } from "vitest";
import { routeOptionsSummary } from "../../src/ui/route-options-summary.js";

describe("routeOptionsSummary", () => {
  it("affiche le seuil du profil par défaut", () => {
    expect(routeOptionsSummary({ speedLimitKmh: null, noSpeedLimit: false, avoidZones: [] })).toBe("≤ 80 km/h");
  });

  it("affiche un seuil personnalisé ou l'absence de limite", () => {
    expect(routeOptionsSummary({ speedLimitKmh: 60, noSpeedLimit: false, avoidZones: [] })).toBe("≤ 60 km/h");
    expect(routeOptionsSummary({ speedLimitKmh: null, noSpeedLimit: true, avoidZones: [] })).toBe("Sans limite");
  });

  it("compte les zones à éviter, au singulier comme au pluriel", () => {
    const zone = { lat: 48, lon: 2, radiusM: 500 };
    expect(routeOptionsSummary({ speedLimitKmh: null, noSpeedLimit: false, avoidZones: [zone] })).toBe(
      "≤ 80 km/h · 1 zone à éviter"
    );
    expect(routeOptionsSummary({ speedLimitKmh: 50, noSpeedLimit: false, avoidZones: [zone, zone, zone] })).toBe(
      "≤ 50 km/h · 3 zones à éviter"
    );
  });

  it("tolère des zones absentes", () => {
    expect(routeOptionsSummary({ speedLimitKmh: null, noSpeedLimit: false })).toBe("≤ 80 km/h");
  });
});
