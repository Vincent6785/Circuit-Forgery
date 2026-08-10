import L from "leaflet";
import { computeRoundTrip } from "../api/routing.js";
import { showRouteError, showBanner } from "../ui/sidebar.js";
import { cheapestInsertionIndex } from "../utils/geo.js";

const FORCED_POINT_COLOR = "#6a1b9a";
const START_HINT = "Cliquez un point de départ sur la carte…";
const FORCED_POINT_HINT = "Cliquez le point que le circuit devra traverser…";

/** Câble le panneau "Circuit en boucle" : distance cible + clic sur la carte
 * comme point de départ, via l'algorithme round_trip de GraphHopper. Les
 * points générés sont ensuite traités comme des waypoints normaux,
 * éditables avec les outils existants.
 *
 * "Point de passage" (optionnel) : GraphHopper n'accepte qu'un seul point
 * pour round_trip (vérifié empiriquement — en envoyer un second échoue avec
 * "For round trip calculation exactly one point is required"), donc le
 * point choisi n'est pas transmis à la génération elle-même. Il est inséré
 * après coup dans la séquence de waypoints reçue, exactement comme le
 * ferait un glisser-déposer sur le tracé (map/route-insert-interaction.js) —
 * le recalcul automatique route ensuite le circuit à travers ce point via
 * le moteur de routage normal. Vit dans le store (`pendingForcedPoint`),
 * pas dans une variable locale au contrôleur, pour être réinitialisé
 * gratuitement partout où `avoidZones`/`speedLimitKmh` le sont déjà
 * (route-controller.js : effacer, annuler une édition, charger/dupliquer
 * un trajet) — un point de passage laissé actif après un "Effacer les
 * points" serait sinon silencieusement réappliqué à la génération suivante.
 *
 * "Nouvelle variante" (régénérer avec les mêmes départ/distance) a besoin
 * du même traitement : `roundTripVariant` vit aussi dans le store plutôt
 * que dans une variable locale, pour la même raison — sinon "Nouvelle
 * variante" resterait activé après un "Effacer les points"/chargement d'un
 * trajet et régénérerait un circuit sans rapport à la place. */
export function initRoundTripController({ map, store, waypointManager, recomputeAndRender }) {
  const distanceInput = document.getElementById("round-trip-distance-input");
  const generateBtn = document.getElementById("round-trip-generate-btn");
  const variantBtn = document.getElementById("round-trip-variant-btn");
  const forcedPointBtn = document.getElementById("round-trip-forced-point-btn");
  const forcedPointStatus = document.getElementById("round-trip-forced-point-status");
  const forcedPointClearBtn = document.getElementById("round-trip-forced-point-clear-btn");
  const hint = document.getElementById("round-trip-hint");
  const hintText = document.getElementById("round-trip-hint-text");
  const cancelBtn = document.getElementById("round-trip-cancel-btn");

  let pickingMode = null; // "start" | "forced-point" | null
  let pendingDistanceM = null; // distance saisie, en attente du clic qui fournira le point de départ
  let forcedPointMarker = null;

  function stopPicking() {
    pickingMode = null;
    waypointManager.setAddOnMapClickEnabled(true);
    hint.classList.add("hidden");
  }

  function renderForcedPoint(point) {
    if (forcedPointMarker) {
      forcedPointMarker.remove();
      forcedPointMarker = null;
    }
    forcedPointStatus.classList.toggle("hidden", !point);
    if (!point) return;

    forcedPointMarker = L.circleMarker([point.lat, point.lon], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: FORCED_POINT_COLOR,
      fillOpacity: 1,
    }).addTo(map);

    const container = document.createElement("div");
    container.textContent = "Point de passage ";
    const removeLink = document.createElement("a");
    removeLink.href = "#";
    removeLink.textContent = "✕ Retirer";
    removeLink.addEventListener("click", (e) => {
      e.preventDefault();
      store.setState({ pendingForcedPoint: null }, { silent: true });
      map.closePopup();
    });
    container.appendChild(removeLink);
    forcedPointMarker.bindPopup(container);
  }

  store.subscribe((state) => renderForcedPoint(state.pendingForcedPoint));
  store.subscribe((state) => {
    variantBtn.disabled = !state.roundTripVariant;
  });

  async function generateFrom(lat, lon, distanceM, seed) {
    generateBtn.disabled = true;
    try {
      const { avoidZones, speedLimitKmh, noSpeedLimit, pendingForcedPoint } = store.getState();
      const result = await computeRoundTrip({ lat, lon }, distanceM, seed, avoidZones, speedLimitKmh, noSpeedLimit);
      let waypoints = result.waypoints;
      if (pendingForcedPoint) {
        // Le point de passage n'est pas forcément sur le tracé généré (il a
        // été cliqué avant même que le circuit existe) : on l'insère à la
        // paire de waypoints consécutifs qui minimise le détour à vol
        // d'oiseau, le routage réel affine ensuite le tracé précis. Fait ici,
        // avant le seul replaceAll ci-dessous, plutôt qu'un replaceAll suivi
        // d'un insertPointAt séparé — pour ne pas faire courir deux recalculs
        // concurrents (même vigilance que pour le bandeau de simplification
        // juste en dessous).
        const index = cheapestInsertionIndex(waypoints, pendingForcedPoint);
        waypoints = [
          ...waypoints.slice(0, index + 1),
          { lat: pendingForcedPoint.lat, lon: pendingForcedPoint.lon },
          ...waypoints.slice(index + 1),
        ];
      }
      waypointManager.replaceAll(waypoints);
      store.setState({ editingRouteId: null }, { silent: true });
      // replaceAll ci-dessus a déjà déclenché un recalcul en fire-and-forget ;
      // on attend explicitement sa fin pour que le bandeau de simplification
      // affiché plus bas ne soit pas écrasé par le hideRouteError()/
      // showRouteError() de ce calcul — même course critique que pour
      // l'import GPX (voir gpx-controller.js).
      await recomputeAndRender(waypoints);
      if (result.simplified) {
        showBanner(
          "Le circuit généré était trop dense : seuls certains points ont été conservés comme waypoints.",
          { type: "info" }
        );
      }
      store.setState({ roundTripVariant: { start: { lat, lon }, distanceM } }, { silent: true });
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
    pendingDistanceM = km * 1000;
    pickingMode = "start";
    waypointManager.setAddOnMapClickEnabled(false);
    hintText.textContent = START_HINT;
    hint.classList.remove("hidden");
  });

  forcedPointBtn.addEventListener("click", () => {
    pickingMode = "forced-point";
    waypointManager.setAddOnMapClickEnabled(false);
    hintText.textContent = FORCED_POINT_HINT;
    hint.classList.remove("hidden");
  });

  map.on("click", (e) => {
    if (!pickingMode) return;
    const mode = pickingMode;
    stopPicking();
    if (mode === "start") {
      generateFrom(e.latlng.lat, e.latlng.lng, pendingDistanceM);
    } else {
      store.setState({ pendingForcedPoint: { lat: e.latlng.lat, lon: e.latlng.lng } }, { silent: true });
    }
  });

  cancelBtn.addEventListener("click", () => stopPicking());
  forcedPointClearBtn.addEventListener("click", () => {
    store.setState({ pendingForcedPoint: null }, { silent: true });
  });

  // Volontairement sans garde anti-frappe-dans-un-champ (contrairement à
  // Suppr dans markers.js) : Échap n'a pas d'usage concurrent dans un champ
  // texte/nombre, et le cas le plus fréquent est justement d'avoir encore
  // le focus sur #round-trip-distance-input juste après avoir cliqué
  // "Générer".
  document.addEventListener("keydown", (e) => {
    if (!pickingMode || e.key !== "Escape") return;
    stopPicking();
  });

  variantBtn.addEventListener("click", () => {
    const { roundTripVariant } = store.getState();
    if (!roundTripVariant) return;
    const seed = Math.floor(Math.random() * 1_000_000);
    generateFrom(roundTripVariant.start.lat, roundTripVariant.start.lon, roundTripVariant.distanceM, seed);
  });
}
