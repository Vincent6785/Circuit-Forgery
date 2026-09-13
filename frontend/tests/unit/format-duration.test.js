import { describe, it, expect } from "vitest";
import { formatDuration } from "../../src/ui/sidebar.js";

describe("formatDuration", () => {
  it.each([
    [0, "0 min"],
    [89, "1 min"],
    [90, "2 min"],
    [3540, "59 min"],
    // Régression : arrondir les minutes après le modulo affichait "1 h 60 min".
    [7185, "2 h 0 min"],
    [3570, "1 h 0 min"],
    [5400, "1 h 30 min"],
    [-30, "0 min"],
  ])("%d s -> %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
