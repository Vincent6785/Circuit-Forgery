import { describe, it, expect, vi } from "vitest";
import { createBusyTracker } from "../../src/utils/busy-tracker.js";
import { gpxFileName } from "../../src/utils/filename.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createBusyTracker", () => {
  it("signale le début et la fin d'une opération, et renvoie sa valeur", async () => {
    const onChange = vi.fn();
    const tracker = createBusyTracker(onChange);
    const op = deferred();

    const tracked = tracker.track(op.promise);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(tracker.isBusy()).toBe(true);

    op.resolve("résultat");
    await expect(tracked).resolves.toBe("résultat");
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(tracker.isBusy()).toBe(false);
  });

  it("ne signale que les transitions quand des opérations se chevauchent", async () => {
    const onChange = vi.fn();
    const tracker = createBusyTracker(onChange);
    const first = deferred();
    const second = deferred();

    const a = tracker.track(first.promise);
    const b = tracker.track(second.promise);
    first.resolve(1);
    await a;
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(tracker.isBusy()).toBe(true);

    second.resolve(2);
    await b;
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("termine l'opération en échec et propage son erreur", async () => {
    const onChange = vi.fn();
    const tracker = createBusyTracker(onChange);
    await expect(tracker.track(Promise.reject(new Error("panne")))).rejects.toThrow("panne");
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    expect(tracker.isBusy()).toBe(false);
  });
});

describe("gpxFileName", () => {
  it.each([
    ["Balade du dimanche", "Balade du dimanche.gpx"],
    ["  Col : Iseran / Galibier ?  ", "Col _ Iseran _ Galibier _.gpx"],
    ['a<b>c|d"e*f', "a_b_c_d_e_f.gpx"],
    ["retour\ttabulation\nligne", "retour tabulation ligne.gpx"],
    ["...caché", "caché.gpx"],
    [null, "trajet.gpx"],
    [undefined, "trajet.gpx"],
    ["   ", "trajet.gpx"],
  ])("%j -> %j", (name, expected) => {
    expect(gpxFileName(name)).toBe(expected);
  });

  it("borne la longueur du nom", () => {
    const fileName = gpxFileName("x".repeat(500));
    expect(fileName).toBe(`${"x".repeat(100)}.gpx`);
  });
});
