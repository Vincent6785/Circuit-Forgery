import { describe, it, expect } from "vitest";
import { roleForIndex } from "../../src/map/waypoint-role.js";

describe("roleForIndex", () => {
  it("un point seul est le départ", () => {
    expect(roleForIndex(0, 1)).toMatchObject({ label: "Départ", badge: "A" });
  });

  it("départ A, étapes numérotées, arrivée B", () => {
    const badges = [0, 1, 2, 3].map((i) => roleForIndex(i, 4).badge);
    expect(badges).toEqual(["A", "1", "2", "B"]);
    expect(roleForIndex(2, 4).label).toBe("Étape 2");
    expect(roleForIndex(3, 4).label).toBe("Arrivée");
  });

  it("chaque rôle a sa propre couleur", () => {
    const colors = new Set([roleForIndex(0, 3).color, roleForIndex(1, 3).color, roleForIndex(2, 3).color]);
    expect(colors.size).toBe(3);
  });
});
