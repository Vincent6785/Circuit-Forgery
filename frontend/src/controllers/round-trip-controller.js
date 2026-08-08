import { computeRoundTrip } from "../api/routing.js";
import { showRouteError, showBanner } from "../ui/sidebar.js";

/** Câble le panneau "Circuit en boucle" : distance cible + clic sur la carte
 * comme point de départ, via l'algorithme round_trip de GraphHopper. Les
 * points générés sont ensuite traités comme des waypoints normaux,
 * éditables avec les outils existants. */
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
      // replaceAll ci-dessus a déjà déclenché un recalcul en fire-and-forget ;
      // on attend explicitement sa fin pour que le bandeau de simplification
      // affiché plus bas ne soit pas écrasé par le hideRouteError()/
      // showRouteError() de ce calcul — même course critique que pour
      // l'import GPX (voir gpx-controller.js).
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

  // Volontairement sans garde anti-frappe-dans-un-champ (contrairement à
  // Suppr dans markers.js) : Échap n'a pas d'usage concurrent dans un champ
  // texte/nombre, et le cas le plus fréquent est justement d'avoir encore
  // le focus sur #round-trip-distance-input juste après avoir cliqué
  // "Générer".
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
