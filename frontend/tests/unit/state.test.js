import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../src/state/store.js";
import { createHistory } from "../../src/state/history.js";

describe("createStore", () => {
  it("fusionne les mises à jour et notifie avec les métadonnées et les clés modifiées", () => {
    const store = createStore({ a: 1, b: 2 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ b: 3 });
    expect(store.getState()).toEqual({ a: 1, b: 3 });
    expect(listener).toHaveBeenCalledWith({ a: 1, b: 3 }, {}, new Set(["b"]));

    store.setState({ a: 5 }, { userChange: true });
    expect(listener).toHaveBeenLastCalledWith({ a: 5, b: 3 }, { userChange: true }, new Set(["a"]));
  });

  it("produit un nouvel objet d'état et garde les références des clés inchangées", () => {
    const list = [1, 2];
    const store = createStore({ list, other: 0 });
    const before = store.getState();
    store.setState({ other: 1 });
    expect(store.getState()).not.toBe(before);
    expect(store.getState().list).toBe(list);
  });

  it("ne compte pas comme modifiée une clé réaffectée à la même valeur", () => {
    const list = [1];
    const store = createStore({ list, n: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ list, n: 1 });
    expect(listener.mock.calls[0][2]).toEqual(new Set(["n"]));
  });

  it("un abonné filtré par clés n'est notifié que si l'une d'elles change", () => {
    const store = createStore({ zones: [], route: null });
    const onZones = vi.fn();
    store.subscribe(onZones, { keys: ["zones"] });

    store.setState({ route: { distance: 1 } });
    expect(onZones).not.toHaveBeenCalled();

    store.setState({ zones: [{ id: 1 }] });
    expect(onZones).toHaveBeenCalledTimes(1);
  });

  it("met en file une mise à jour demandée pendant une notification", () => {
    const store = createStore({ step: 0, derived: null });
    const seen = [];
    store.subscribe((state) => {
      if (state.step === 1 && state.derived === null) store.setState({ derived: "calculé" });
    });
    store.subscribe((state) => seen.push({ ...state }));

    store.setState({ step: 1 });

    // Le second abonné voit d'abord l'état de la mise à jour initiale, puis
    // celui de la mise à jour imbriquée — jamais dans le désordre.
    expect(seen).toEqual([
      { step: 1, derived: null },
      { step: 1, derived: "calculé" },
    ]);
    expect(store.getState().derived).toBe("calculé");
  });

  it("reste utilisable après une exception d'abonné", () => {
    const store = createStore({ n: 0 });
    const failing = store.subscribe(() => {
      throw new Error("abonné en échec");
    });
    expect(() => store.setState({ n: 1 })).toThrow("abonné en échec");
    failing();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ n: 2 });
    expect(listener).toHaveBeenCalled();
  });

  it("se désabonne, y compris avec un filtre de clés", () => {
    const store = createStore({ x: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener, { keys: ["x"] });
    unsubscribe();
    store.setState({ x: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("createHistory", () => {
  it("annule puis rétablit dans l'ordre", () => {
    const history = createHistory();
    history.push("s1");
    history.push("s2");
    expect(history.undo("s3")).toBe("s2");
    expect(history.undo("s2")).toBe("s1");
    expect(history.canUndo()).toBe(false);
    expect(history.redo("s1")).toBe("s2");
    expect(history.redo("s2")).toBe("s3");
    expect(history.canRedo()).toBe(false);
  });

  it("renvoie null sans rien à annuler ou rétablir", () => {
    const history = createHistory();
    expect(history.undo("x")).toBeNull();
    expect(history.redo("x")).toBeNull();
  });

  it("une nouvelle mutation vide la pile de rétablissement", () => {
    const history = createHistory();
    history.push("s1");
    history.undo("s2");
    expect(history.canRedo()).toBe(true);
    history.push("s1bis");
    expect(history.canRedo()).toBe(false);
  });

  it("borne l'historique à 50 états, en oubliant les plus anciens", () => {
    const history = createHistory();
    for (let i = 0; i < 60; i++) history.push(i);
    const restored = [];
    let snapshot;
    while ((snapshot = history.undo("courant")) !== null) restored.push(snapshot);
    expect(restored).toHaveLength(50);
    expect(restored.at(-1)).toBe(10);
  });

  it("reset vide les deux piles", () => {
    const history = createHistory();
    history.push("s1");
    history.undo("s2");
    history.reset();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
