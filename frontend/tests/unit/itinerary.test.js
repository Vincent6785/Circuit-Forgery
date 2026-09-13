import { describe, it, expect } from "vitest";
import {
  ITINERARY_FIELDS,
  indexForNewPoint,
  indexForRouteDrop,
  isFieldEnabled,
  searchFieldAction,
  fieldDisplayValue,
} from "../../src/utils/itinerary.js";

// A -> B est un segment est-ouest, B -> C un segment sud-nord.
const A = { id: 1, lat: 48.0, lon: 2.0, label: null };
const B = { id: 2, lat: 48.0, lon: 3.0, label: "Chez moi" };
const C = { id: 3, lat: 49.0, lon: 3.0, label: null };

describe("indexForNewPoint", () => {
  it("ajoute en fin tant que départ et arrivée ne sont pas posés", () => {
    expect(indexForNewPoint([], { lat: 48.5, lon: 2.5 })).toBe(0);
    expect(indexForNewPoint([A], { lat: 48.5, lon: 2.5 })).toBe(1);
  });

  it("insère entre départ et arrivée, l'arrivée restant le dernier point", () => {
    expect(indexForNewPoint([A, B], { lat: 48.1, lon: 2.5 })).toBe(1);
  });

  it("insère dans la paire de points qui allonge le moins le trajet", () => {
    expect(indexForNewPoint([A, B, C], { lat: 48.5, lon: 3.05 })).toBe(2);
    expect(indexForNewPoint([A, B, C], { lat: 47.95, lon: 2.4 })).toBe(1);
  });

  it("append ajoute toujours en fin (Maj + clic)", () => {
    expect(indexForNewPoint([A, B, C], { lat: 48.5, lon: 3.05 }, { append: true })).toBe(3);
    expect(indexForNewPoint([], { lat: 48.5, lon: 3.05 }, { append: true })).toBe(0);
  });
});

describe("indexForRouteDrop", () => {
  const P = { lat: 48.5, lon: 3.05 }; // proche du segment B -> C

  it("utilise la paire de waypoints du segment attrapé quand les bornes sont à jour", () => {
    // Bornes des waypoints A, B, C dans les coordonnées du tracé.
    expect(indexForRouteDrop([A, B, C], [0, 10, 25], 3, P)).toBe(1);
    expect(indexForRouteDrop([A, B, C], [0, 10, 25], 12, P)).toBe(2);
  });

  it("se rabat sur la position de dépôt sans bornes (trajet sauvegardé rouvert)", () => {
    expect(indexForRouteDrop([A, B, C], [], 3, P)).toBe(2);
    expect(indexForRouteDrop([A, B, C], undefined, 3, P)).toBe(2);
  });

  it("ignore des bornes périmées, qui ne correspondent plus aux points", () => {
    expect(indexForRouteDrop([A, B, C], [0, 25], 3, P)).toBe(2);
  });

  it("reste entre deux points même sur le dernier segment", () => {
    expect(indexForRouteDrop([A, B], [0, 10], 9, { lat: 48.1, lon: 2.9 })).toBe(1);
  });
});

describe("isFieldEnabled", () => {
  it.each([
    ["start", [], true],
    ["end", [], false],
    ["end", [A], true],
    ["step", [A], false],
    ["step", [A, B], true],
    ["inconnu", [A, B], false],
  ])("%s avec %j points -> %s", (field, points, expected) => {
    expect(isFieldEnabled(points, field)).toBe(expected);
  });

  it("couvre tous les champs déclarés", () => {
    expect(ITINERARY_FIELDS).toEqual(["start", "end", "step"]);
  });
});

describe("searchFieldAction", () => {
  const P = { lat: 48.1, lon: 2.5 };

  it("départ : crée le premier point, puis remplace le départ existant", () => {
    expect(searchFieldAction([], "start", P)).toEqual({ type: "insert", index: 0 });
    expect(searchFieldAction([A], "start", P)).toEqual({ type: "edit", id: A.id });
    expect(searchFieldAction([A, B, C], "start", P)).toEqual({ type: "edit", id: A.id });
  });

  it("arrivée : impossible sans départ, ajoutée après le départ, puis remplacée", () => {
    expect(searchFieldAction([], "end", P)).toBeNull();
    expect(searchFieldAction([A], "end", P)).toEqual({ type: "insert", index: 1 });
    expect(searchFieldAction([A, B], "end", P)).toEqual({ type: "edit", id: B.id });
    expect(searchFieldAction([A, B, C], "end", P)).toEqual({ type: "edit", id: C.id });
  });

  it("étape : impossible sans départ et arrivée, sinon insérée au meilleur endroit", () => {
    expect(searchFieldAction([A], "step", P)).toBeNull();
    expect(searchFieldAction([A, B], "step", P)).toEqual({ type: "insert", index: 1 });
    expect(searchFieldAction([A, B, C], "step", { lat: 48.5, lon: 3.05 })).toEqual({ type: "insert", index: 2 });
  });

  it("champ inconnu : aucune action", () => {
    expect(searchFieldAction([A, B], "autre", P)).toBeNull();
  });
});

describe("fieldDisplayValue", () => {
  it("affiche le libellé, ou à défaut les coordonnées", () => {
    expect(fieldDisplayValue([A, B], "start")).toBe("48.00000, 2.00000");
    expect(fieldDisplayValue([A, B], "end")).toBe("Chez moi");
  });

  it("n'affiche pas d'arrivée tant qu'il n'y a qu'un point", () => {
    expect(fieldDisplayValue([], "start")).toBe("");
    expect(fieldDisplayValue([A], "end")).toBe("");
  });

  it("laisse toujours le champ étape vide", () => {
    expect(fieldDisplayValue([A, B, C], "step")).toBe("");
  });
});
