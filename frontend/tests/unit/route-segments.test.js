import { describe, it, expect } from "vitest";
import {
  UNKNOWN_SPEED_COLOR,
  speedColor,
  groupRunsByColor,
  nearestSegment,
  legIndexForCoordIndex,
} from "../../src/utils/route-segments.js";

const GREEN = "#2e7d32";
const AMBER = "#f9a825";
const ORANGE = "#e64a19";

describe("speedColor", () => {
  it.each([
    [null, UNKNOWN_SPEED_COLOR],
    [undefined, UNKNOWN_SPEED_COLOR],
    [30, GREEN],
    [50, GREEN],
    [51, AMBER],
    [70, AMBER],
    [71, ORANGE],
  ])("%s km/h -> %s", (speed, color) => {
    expect(speedColor(speed)).toBe(color);
  });
});

describe("groupRunsByColor", () => {
  // GeoJSON : [lon, lat]
  const coords = [
    [2.0, 48.0],
    [2.1, 48.0],
    [2.2, 48.0],
    [2.3, 48.0],
    [2.4, 48.0],
  ];

  it("fusionne les segments consécutifs de même couleur, en [lat, lon]", () => {
    const runs = groupRunsByColor(coords, [30, 40, 60, null]);
    expect(runs).toEqual([
      { color: GREEN, latlngs: [[48.0, 2.0], [48.0, 2.1], [48.0, 2.2]] },
      { color: AMBER, latlngs: [[48.0, 2.2], [48.0, 2.3]] },
      { color: UNKNOWN_SPEED_COLOR, latlngs: [[48.0, 2.3], [48.0, 2.4]] },
    ]);
  });

  it("partage les sommets de jonction : le tracé reste continu", () => {
    const runs = groupRunsByColor(coords, [30, 60, 30, 60]);
    for (let i = 0; i < runs.length - 1; i++) {
      expect(runs[i].latlngs.at(-1)).toEqual(runs[i + 1].latlngs[0]);
    }
    const vertexCount = runs.reduce((sum, run) => sum + run.latlngs.length, 0) - (runs.length - 1);
    expect(vertexCount).toBe(coords.length);
  });

  it("un tracé sans vitesses connues forme un seul tronçon gris", () => {
    expect(groupRunsByColor(coords, [])).toEqual([
      { color: UNKNOWN_SPEED_COLOR, latlngs: coords.map(([lon, lat]) => [lat, lon]) },
    ]);
    expect(groupRunsByColor(coords, undefined)).toHaveLength(1);
  });

  it("moins de deux coordonnées : aucun tronçon", () => {
    expect(groupRunsByColor([], [])).toEqual([]);
    expect(groupRunsByColor([[2.0, 48.0]], [])).toEqual([]);
  });
});

describe("nearestSegment", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it("projette sur le segment le plus proche", () => {
    expect(nearestSegment(points, { x: 5, y: 3 })).toEqual({ index: 0, x: 5, y: 0 });
    expect(nearestSegment(points, { x: 12, y: 6 })).toEqual({ index: 1, x: 10, y: 6 });
  });

  it("borne la projection aux extrémités du segment", () => {
    expect(nearestSegment(points, { x: -5, y: -1 })).toEqual({ index: 0, x: 0, y: 0 });
    expect(nearestSegment(points, { x: 10, y: 20 })).toEqual({ index: 1, x: 10, y: 10 });
  });

  it("gère un segment de longueur nulle", () => {
    expect(nearestSegment([{ x: 3, y: 3 }, { x: 3, y: 3 }], { x: 0, y: 0 })).toEqual({ index: 0, x: 3, y: 3 });
  });

  it("renvoie null sans segment", () => {
    expect(nearestSegment([], { x: 0, y: 0 })).toBeNull();
    expect(nearestSegment([{ x: 1, y: 1 }], { x: 0, y: 0 })).toBeNull();
  });
});

describe("legIndexForCoordIndex", () => {
  it("retrouve la paire de waypoints contenant le segment", () => {
    const boundaries = [0, 10, 25];
    expect(legIndexForCoordIndex(boundaries, 0)).toBe(0);
    expect(legIndexForCoordIndex(boundaries, 9)).toBe(0);
    expect(legIndexForCoordIndex(boundaries, 10)).toBe(1);
    expect(legIndexForCoordIndex(boundaries, 24)).toBe(1);
  });

  it("ne désigne jamais une paire au-delà de l'arrivée", () => {
    expect(legIndexForCoordIndex([0, 10, 25], 25)).toBe(1);
    expect(legIndexForCoordIndex([0, 10, 25], 99)).toBe(1);
  });

  it("gère deux waypoints au même endroit du tracé", () => {
    // Waypoints 1 et 2 confondus : le segment 10 appartient à la paire 2 -> 3.
    expect(legIndexForCoordIndex([0, 10, 10, 20], 10)).toBe(2);
  });

  it("sans bornes exploitables, insère après le départ", () => {
    expect(legIndexForCoordIndex([], 5)).toBe(0);
    expect(legIndexForCoordIndex(undefined, 5)).toBe(0);
    expect(legIndexForCoordIndex([0], 5)).toBe(0);
  });
});
