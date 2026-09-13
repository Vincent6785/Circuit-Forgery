import { describe, it, expect } from "vitest";
import { normalizeIds } from "../../src/utils/waypoint-ids.js";

const point = (id) => ({ id, lat: 48, lon: 2, label: null });

describe("normalizeIds", () => {
  it("conserve des identifiants valides et reprend le compteur au-delà du plus grand", () => {
    const { points, nextId } = normalizeIds([point(3), point(7), point(5)], 1);
    expect(points.map((p) => p.id)).toEqual([3, 7, 5]);
    expect(nextId).toBe(8);
  });

  it("ne fait jamais reculer le compteur", () => {
    expect(normalizeIds([point(2)], 10).nextId).toBe(10);
  });

  it("attribue un identifiant aux points qui n'en ont pas (trajet sauvegardé)", () => {
    const { points, nextId } = normalizeIds([point(undefined), point(undefined)], 4);
    expect(points.map((p) => p.id)).toEqual([4, 5]);
    expect(nextId).toBe(6);
  });

  it("remplace les identifiants dupliqués ou invalides sans collision", () => {
    const { points, nextId } = normalizeIds([point(1), point(1), point("x"), point(-2), point(2.5)], 1);
    const ids = points.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(1);
    expect(ids.every((id) => Number.isSafeInteger(id) && id >= 1)).toBe(true);
    expect(nextId).toBeGreaterThan(Math.max(...ids));
  });

  it("ne modifie pas les objets d'entrée et garde les autres champs", () => {
    const input = [{ lat: 1, lon: 2, label: "Départ" }];
    const { points } = normalizeIds(input, 1);
    expect(input[0].id).toBeUndefined();
    expect(points[0]).toEqual({ id: 1, lat: 1, lon: 2, label: "Départ" });
  });
});
