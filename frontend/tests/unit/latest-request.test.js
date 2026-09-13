import { describe, it, expect, vi, afterEach } from "vitest";
import { createLatestRequest, isAbortError } from "../../src/api/latest-request.js";
import { fetchWithTimeout } from "../../src/api/http.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Tâche qui attend d'être résolue, et rejette en AbortError si son signal est annulé. */
function controllableTask() {
  const d = deferred();
  const task = (signal) => {
    signal.addEventListener("abort", () => d.reject(new DOMException("aborted", "AbortError")));
    return d.promise;
  };
  return { task, resolve: d.resolve, reject: d.reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createLatestRequest", () => {
  it("renvoie la valeur de la requête d'actualité", async () => {
    const latest = createLatestRequest();
    await expect(latest.run(async () => 42)).resolves.toEqual({ stale: false, value: 42 });
  });

  it("annule la requête précédente et la signale périmée", async () => {
    const latest = createLatestRequest();
    const first = controllableTask();
    const second = controllableTask();
    let firstSignal;

    const firstRun = latest.run((signal) => {
      firstSignal = signal;
      return first.task(signal);
    });
    const secondRun = latest.run(second.task);

    expect(firstSignal.aborted).toBe(true);
    second.resolve("récent");
    await expect(firstRun).resolves.toEqual({ stale: true });
    await expect(secondRun).resolves.toEqual({ stale: false, value: "récent" });
  });

  it("signale périmée une réponse arrivée après une requête plus récente, même sans prise en compte du signal", async () => {
    const latest = createLatestRequest();
    const slow = deferred();
    const firstRun = latest.run(() => slow.promise);
    const secondRun = latest.run(async () => "récent");
    slow.resolve("ancien");
    await expect(firstRun).resolves.toEqual({ stale: true });
    await expect(secondRun).resolves.toEqual({ stale: false, value: "récent" });
  });

  it("propage l'erreur d'une requête d'actualité, mais pas celle d'une requête remplacée", async () => {
    const latest = createLatestRequest();
    await expect(latest.run(async () => Promise.reject(new Error("panne")))).rejects.toThrow("panne");

    const replaced = deferred();
    const replacedRun = latest.run(() => replaced.promise);
    latest.run(async () => "ok");
    replaced.reject(new Error("erreur périmée"));
    await expect(replacedRun).resolves.toEqual({ stale: true });
  });

  it("cancel annule la requête en cours", async () => {
    const latest = createLatestRequest();
    const pending = controllableTask();
    const run = latest.run(pending.task);
    latest.cancel();
    await expect(run).resolves.toEqual({ stale: true });
  });

  it("isAbortError reconnaît une annulation", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("autre"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});

describe("fetchWithTimeout avec un signal externe", () => {
  function abortableFetch() {
    return vi.fn(
      (url, { signal }) =>
        new Promise((_, reject) => {
          // Comme fetch() : rejet immédiat si le signal est déjà annulé.
          if (signal.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })
    );
  }

  it("propage une annulation de l'appelant comme AbortError, pas comme un délai dépassé", async () => {
    vi.stubGlobal("fetch", abortableFetch());
    const controller = new AbortController();
    const request = fetchWithTimeout("/api/x", { signal: controller.signal }, 10_000);
    controller.abort();
    const error = await request.catch((err) => err);
    expect(isAbortError(error)).toBe(true);
  });

  it("annule immédiatement si le signal est déjà annulé", async () => {
    const fetchMock = abortableFetch();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const error = await fetchWithTimeout("/api/x", { signal: controller.signal }).catch((err) => err);
    expect(isAbortError(error)).toBe(true);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("garde le message de délai dépassé quand c'est le timeout qui annule", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortableFetch());
    const controller = new AbortController();
    const assertion = expect(fetchWithTimeout("/api/x", { signal: controller.signal }, 100)).rejects.toThrow(
      "délai dépassé"
    );
    vi.advanceTimersByTime(100);
    await assertion;
  });
});
