import { computeRoundTrip } from "../api/routing.js";
import { showRouteError, showBanner } from "../ui/sidebar.js";

/** Câble le panneau "Circuit en boucle" : distance cible + clic sur la carte
 * comme point de départ (algorithme round_trip de GraphHopper, cf. plan) —
 * les points générés sont adoptés comme des waypoints normaux, éditables
 * ensuite avec les outils existants. */
export function initRoundTripController({ map, store, waypointManager, recomputeAndRender }) {
  const distanceInput = document.getElementById("round-trip-distance-input");
  const generateBtn = document.getElementById("round-trip-generate-btn");
  const variantBtn = document.getElementById("round-trip-variant-btn");
  const hint = document.getElementById("round-trip-hint");
  const cancelBtn = document.getElementById("round-trip-cancel-btn");

  let picking = false;
  let lastStart = null;
  let lastDistanceM = null;

  function stopPicking() {
    picking = false;
    waypointManager.setAddOnMapClickEnabled(true);
    hint.classList.add("hidden");
  }

  async function generateFrom(lat, lon, distanceM, seed) {
    generateBtn.disabled = true;
    try {
      const result = await computeRoundTrip({ lat, lon }, distanceM, seed);
      waypointManager.replaceAll(result.waypoints);
      store.setState({ editingRouteId: null }, { silent: true });
      // Attend explicitement la fin du recalcul (déclenché aussi, en
      // fire-and-forget, par replaceAll ci-dessus) pour que le bandeau de
      // simplification ci-dessous ne soit pas écrasé par
      // hideRouteError()/showRouteError() une fois ce calcul résolu — même
      // course critique que pour l'import GPX (cf. gpx-controller.js).
      await recomputeAndRender(result.waypoints);
      if (result.simplified) {
        showBanner(
          "Le circuit généré était trop dense : seuls certains points ont été conservés comme waypoints.",
          { type: "info" }
        );
      }
      lastStart = { lat, lon };
      lastDistanceM = distanceM;
      variantBtn.disabled = false;
    } catch (err) {
      showRouteError(err.message);
    } finally {
      generateBtn.disabled = false;
    }
  }

  generateBtn.addEventListener("click", () => {
    const km = parseFloat(distanceInput.value);
    if (!Number.isFinite(km) || km <= 0) {
      showRouteError("Distance de circuit invalide.");
      return;
    }
    lastDistanceM = km * 1000;
    picking = true;
    waypointManager.setAddOnMapClickEnabled(false);
    hint.classList.remove("hidden");
  });

  map.on("click", (e) => {
    if (!picking) return;
    stopPicking();
    generateFrom(e.latlng.lat, e.latlng.lng, lastDistanceM);
  });

  cancelBtn.addEventListener("click", () => stopPicking());

  // Pas de garde anti-frappe-dans-un-champ ici (contrairement à Suppr dans
  // markers.js) : Échap n'a pas de sens concurrent dans un champ texte/nombre,
  // et le cas courant est justement d'avoir encore le focus sur
  // #round-trip-distance-input juste après avoir cliqué "Générer".
  document.addEventListener("keydown", (e) => {
    if (!picking || e.key !== "Escape") return;
    stopPicking();
  });

  variantBtn.addEventListener("click", () => {
    if (!lastStart || !lastDistanceM) return;
    const seed = Math.floor(Math.random() * 1_000_000);
    generateFrom(lastStart.lat, lastStart.lon, lastDistanceM, seed);
  });
}
