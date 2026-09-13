// @ts-check

const DEFAULT_TIMEOUT_MS = 35_000;

/** Erreur d'API portant le statut HTTP, pour que l'appelant distingue par
 * exemple un trajet disparu (404) d'une panne. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * fetch() avec un timeout par défaut : sans ça, un backend qui se bloque
 * (bug inattendu, verrou SQLite...) fait tourner l'UI indéfiniment, sans
 * message d'erreur ni option de réessai. 35 s, légèrement au-dessus des 30 s
 * utilisés côté backend pour ses propres appels à GraphHopper/Nominatim.
 *
 * `options.signal` (annulation par l'appelant, voir latest-request.js) est
 * combiné au timeout : une annulation est propagée telle quelle (AbortError),
 * un timeout devient une erreur explicite.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const external = options.signal;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external?.aborted) forwardAbort();
  else external?.addEventListener("abort", forwardAbort, { once: true });

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new Error("Le serveur ne répond pas (délai dépassé).", { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Message lisible depuis le champ `detail` d'une réponse d'erreur FastAPI :
 * une chaîne pour les erreurs levées par l'application, un tableau d'objets
 * {loc, msg} pour les erreurs de validation (422) — affiché tel quel, ce
 * dernier donnait "[object Object]".
 *
 * @param {unknown} detail
 * @param {string} fallback
 */
export function errorMessageFromDetail(detail, fallback) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(formatValidationError).filter(Boolean);
    if (messages.length > 0) return messages.join(" ; ");
  }
  return fallback;
}

/** @param {any} item */
function formatValidationError(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item.msg !== "string") return null;
  const field = Array.isArray(item.loc)
    ? item.loc.filter((/** @type {unknown} */ part) => part !== "body").join(".")
    : "";
  return field ? `${field} : ${item.msg}` : item.msg;
}

/**
 * fetchWithTimeout() + vérification du statut + extraction du message
 * d'erreur, communes aux modules d'API.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {string} [fallbackMessage]
 */
export async function apiFetch(url, options = {}, fallbackMessage = "Erreur API") {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(errorMessageFromDetail(body?.detail, `${fallbackMessage} (${res.status})`), res.status);
  }
  return res.status === 204 ? null : res.json();
}
