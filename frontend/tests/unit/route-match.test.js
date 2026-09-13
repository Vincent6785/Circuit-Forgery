import { describe, it, expect } from "vitest";
import { isSameRoute } from "../../src/utils/route-match.js";

describe("isSameRoute", () => {
  it("accepte des distances identiques ou à 1 % près", () => {
    expect(isSameRoute(10_000, 10_000)).toBe(true);
    expect(isSameRoute(10_000, 10_099)).toBe(true);
    expect(isSameRoute(10_000, 9_901)).toBe(true);
  });

  it("garde une tolérance minimale de 50 m sur un trajet court", () => {
    expect(isSameRoute(1_000, 1_049)).toBe(true);
    expect(isSameRoute(1_000, 1_051)).toBe(false);
  });

  it("refuse un tracé devenu nettement différent", () => {
    expect(isSameRoute(10_000, 10_500)).toBe(false);
  });

  it("refuse des valeurs absentes ou non finies", () => {
    expect(isSameRoute(undefined, 1000)).toBe(false);
    expect(isSameRoute(1000, NaN)).toBe(false);
    expect(isSameRoute(Infinity, Infinity)).toBe(false);
  });
});
