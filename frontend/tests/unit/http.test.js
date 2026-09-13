import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, apiFetch, errorMessageFromDetail, fetchWithTimeout } from "../../src/api/http.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("errorMessageFromDetail", () => {
  it("garde un message d'erreur applicatif", () => {
    expect(errorMessageFromDetail("Trop de waypoints", "fallback")).toBe("Trop de waypoints");
  });

  it("formate les erreurs de validation FastAPI (422)", () => {
    const detail = [
      { loc: ["body", "name"], msg: "String should have at most 200 characters", type: "string_too_long" },
      { loc: ["body", "waypoints", 0, "lat"], msg: "Field required", type: "missing" },
    ];
    expect(errorMessageFromDetail(detail, "fallback")).toBe(
      "name : String should have at most 200 characters ; waypoints.0.lat : Field required"
    );
  });

  it("garde un message sans emplacement", () => {
    expect(errorMessageFromDetail([{ msg: "Invalide" }], "fallback")).toBe("Invalide");
  });

  it("se rabat sur le message par défaut pour un détail vide ou inexploitable", () => {
    for (const detail of [undefined, null, "", "   ", [], [{}], { message: "x" }, 42]) {
      expect(errorMessageFromDetail(detail, "fallback")).toBe("fallback");
    }
  });
});

describe("apiFetch", () => {
  it("renvoie le JSON d'une réponse réussie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { ok: true })));
    await expect(apiFetch("/api/x")).resolves.toEqual({ ok: true });
  });

  it("renvoie null pour une réponse 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(apiFetch("/api/x", { method: "DELETE" })).resolves.toBeNull();
  });

  it("lève une ApiError lisible avec le statut pour une erreur de validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(422, { detail: [{ loc: ["body", "name"], msg: "Field required" }] }))
    );
    const error = await apiFetch("/api/x").catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("name : Field required");
  });

  it("utilise le message par défaut et le statut pour une réponse non JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    const error = await apiFetch("/api/x", {}, "Erreur de calcul").catch((err) => err);
    expect(error.status).toBe(502);
    expect(error.message).toBe("Erreur de calcul (502)");
  });
});

describe("fetchWithTimeout", () => {
  it("abandonne la requête après le délai avec un message explicite", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url, { signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
    );
    const assertion = expect(fetchWithTimeout("/api/lent", {}, 100)).rejects.toThrow("délai dépassé");
    vi.advanceTimersByTime(100);
    await assertion;
  });

  it("transmet les autres erreurs réseau telles quelles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(fetchWithTimeout("/api/x")).rejects.toThrow("Failed to fetch");
  });
});
