import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../src/state/store.js";
import { createHistory } from "../../src/state/history.js";

describe("createStore", () => {
  it("fusionne les mises à jour et notifie avec les métadonnées", () => {
    const store = createStore({ a: 1, b: 2 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ b: 3 }, { silent: true });
    expect(store.getState()).toEqual({ a: 1, b: 3 });
    expect(listener).toHaveBeenCalledWith({ a: 1, b: 3 }, { silent: true });

    store.setState({ a: 5 });
    expect(listener).toHaveBeenLastCalledWith({ a: 5, b: 3 }, {});
  });

  it("produit un nouvel objet d'état et garde les références des clés inchangées", () => {
    const list = [1, 2];
    const store = createStore({ list, other: 0 });
    const before = store.getState();
    store.setState({ other: 1 });
    expect(store.getState()).not.toBe(before);
    expect(store.getState().list).toBe(list);
  });

  it("se désabonne", () => {
    const store = createStore({});
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
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
