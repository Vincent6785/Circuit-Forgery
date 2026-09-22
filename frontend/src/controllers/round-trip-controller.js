import { computeRoundTrip } from "../api/routing.js";
import { showRouteError, showBanner } from "../ui/sidebar.js";
import { ForcedPointLayer } from "../map/forced-point-layer.js";
import { renderForcedPointList } from "../ui/forced-point-list.js";
import { TAB_CHANGE_EVENT } from "../ui/tabs.js";

const START_HINT = "Cliquez un point de départ sur la carte…";
const FORCED_POINT_HINT = "Cliquez les points que le circuit devra traverser…";
const CANCEL_LABEL = "Annuler (Échap)";
const DONE_LABEL = "Terminer (Échap)";

/** Câble le panneau "Circuit en boucle" : distance cible + clic sur la carte
 * comme point de départ, via l'algorithme round_trip de GraphHopper. Les
 * points générés sont ensuite traités comme des waypoints normaux,
 * éditables avec les outils existants.
 *
 * "Points de passage" (optionnel) : GraphHopper n'accepte qu'un seul point
 * pour round_trip (vérifié empiriquement — en envoyer un second échoue avec
 * "For round trip calculation exactly one point is required"), donc ces
 * points ne sont pas transmis à la génération elle-même. Ils sont envoyés
 * au backend (`via_points`), qui les insère dans la séquence de waypoints du
 * circuit obtenu là où ils allongent le moins le parcours — exactement comme
 * le ferait un glisser-déposer sur le tracé (map/route-insert-interaction.js).
 * Le recalcul automatique route ensuite le circuit à travers ces points via
 * le moteur de routage normal, en plus du point de départ, qui est aussi le
 * point d'arrivée. L'insertion est faite côté serveur parce que c'est lui qui
 * échantillonne le circuit généré : il doit réserver autant d'emplacements
 * que de points de passage sous le plafond de waypoints, sinon un circuit
 * dense dépasse ce plafond et son propre recalcul échoue.
 *
 * Le mode de pose reste actif d'un clic à l'autre, pour en enchaîner
 * plusieurs sans revenir au panneau ; Échap ou "Terminer" en sort.
 *
 * La liste vit dans le store (`pendingForcedPoints`), pas dans une variable
 * locale au contrôleur, pour être réinitialisée gratuitement partout où
 * `avoidZones`/`speedLimitKmh` le sont déjà (route-controller.js : effacer,
 * annuler une édition, charger/dupliquer un trajet) — des points de passage
 * laissés actifs après un "Effacer les points" seraient sinon silencieusement
 * réappliqués à la génération suivante.
 *
 * "Autre variante" (régénérer avec les mêmes départ/distance) a besoin
 * du même traitement : `roundTripVariant` vit aussi dans le store plutôt
 * que dans une variable locale, pour la même raison — sinon "Autre
 * variante" resterait activé après un "Effacer les points"/chargement d'un
 * trajet et régénérerait un circuit sans rapport à la place. */
export function initRoundTripController({ map, store, waypointManager, waitForRecompute, trackBusy = (promise) => promise }) {
  const distanceInput = document.getElementById("round-trip-distance-input");
  const generateBtn = document.getElementById("round-trip-generate-btn");
  const variantBtn = document.getElementById("round-trip-variant-btn");
  const forcedPointBtn = document.getElementById("round-trip-forced-point-btn");
  const forcedPointPanel = document.getElementById("round-trip-forced-point-panel");
  const forcedPointClearBtn = document.getElementById("round-trip-forced-point-clear-btn");
  const hint = document.getElementById("round-trip-hint");
  const hintText = document.getElementById("round-trip-hint-text");
  const cancelBtn = document.getElementById("round-trip-cancel-btn");

  const forcedPointLayer = new ForcedPointLayer(map, (index) => removeForcedPointAt(index));

  let pickingMode = null; // "start" | "forced-point" | null
  let pendingDistanceM = null; // distance saisie, en attente du clic qui fournira le point de départ
  // Génération en cours : "Autre variante" reste désactivé jusqu'à la fin,
  // sans quoi deux générations concurrentes pouvaient se chevaucher.
  let generating = false;

  function startPicking(mode, text, cancelLabel) {
    pickingMode = mode;
    waypointManager.setAddOnMapClickEnabled(false);
    hintText.textContent = text;
    cancelBtn.textContent = cancelLabel;
    hint.classList.remove("hidden");
    syncForcedPointButton();
  }

  function stopPicking() {
    pickingMode = null;
    waypointManager.setAddOnMapClickEnabled(true);
    hint.classList.add("hidden");
    syncForcedPointButton();
  }

  // Libellé constant, comme le bouton "Éviter une zone" : l'état est porté
  // par aria-pressed (un libellé qui change en plus était annoncé deux fois)
  // et par l'indication visible.
  function syncForcedPointButton() {
    const active = pickingMode === "forced-point";
    forcedPointBtn.classList.toggle("active", active);
    forcedPointBtn.setAttribute("aria-pressed", String(active));
  }

  function setForcedPoints(points) {
    store.setState({ pendingForcedPoints: points });
  }

  function removeForcedPointAt(index) {
    setForcedPoints(store.getState().pendingForcedPoints.filter((_, i) => i !== index));
  }

  store.subscribe(
    (state) => {
      const points = state.pendingForcedPoints;
      forcedPointLayer.render(points);
      renderForcedPointList(points, removeForcedPointAt);
      forcedPointPanel.classList.toggle("hidden", points.length === 0);
    },
    { keys: ["pendingForcedPoints"] }
  );

  function syncVariantButton() {
    variantBtn.disabled = generating || !store.getState().roundTripVariant;
  }
  store.subscribe(syncVariantButton, { keys: ["roundTripVariant"] });

  async function generateFrom(lat, lon, distanceM, seed) {
    generating = true;
    generateBtn.disabled = true;
    syncVariantButton();
    try {
      const { avoidZones, speedLimitKmh, noSpeedLimit, pendingForcedPoints } = store.getState();
      const result = await trackBusy(
        computeRoundTrip({ lat, lon }, distanceM, seed, avoidZones, speedLimitKmh, noSpeedLimit, pendingForcedPoints)
      );
      // Les points de passage sont déjà dans result.waypoints : le backend les
      // y a insérés, et a réservé leurs emplacements en échantillonnant le
      // circuit d'autant moins finement.
      waypointManager.replaceAll(result.waypoints);
      store.setState({ editingRouteId: null });
      // replaceAll ci-dessus a déclenché le calcul d'itinéraire ; on attend sa
      // fin pour que le bandeau de simplification affiché plus bas ne soit
      // pas écrasé par ce calcul — même course que pour l'import GPX (voir
      // gpx-controller.js).
      await waitForRecompute();
      if (result.simplified) {
        showBanner(
          "Le circuit généré était trop dense : seuls certains points ont été conservés comme waypoints.",
          { type: "info" }
        );
      }
      store.setState({ roundTripVariant: { start: { lat, lon }, distanceM } });
    } catch (err) {
      showRouteError(err.message);
    } finally {
      generating = false;
      generateBtn.disabled = false;
      syncVariantButton();
    }
  }

  generateBtn.addEventListener("click", () => {
    const km = parseFloat(distanceInput.value);
    if (!Number.isFinite(km) || km <= 0) {
      showRouteError("Distance de circuit invalide.");
      return;
    }
    pendingDistanceM = km * 1000;
    startPicking("start", START_HINT, CANCEL_LABEL);
  });

  forcedPointBtn.addEventListener("click", () => {
    if (pickingMode === "forced-point") stopPicking();
    else startPicking("forced-point", FORCED_POINT_HINT, DONE_LABEL);
  });

  map.on("click", (e) => {
    if (!pickingMode) return;
    const point = { lat: e.latlng.lat, lon: e.latlng.lng };
    if (pickingMode === "start") {
      stopPicking();
      generateFrom(point.lat, point.lon, pendingDistanceM);
      return;
    }
    // Le mode reste actif : poser plusieurs points de passage à la suite ne
    // demande pas de revenir cliquer le bouton entre chacun.
    setForcedPoints([...store.getState().pendingForcedPoints, point]);
  });

  cancelBtn.addEventListener("click", () => stopPicking());
  forcedPointClearBtn.addEventListener("click", () => setForcedPoints([]));

  // Volontairement sans garde anti-frappe-dans-un-champ (contrairement à
  // Suppr dans markers.js) : Échap n'a pas d'usage concurrent dans un champ
  // texte/nombre, et le cas le plus fréquent est justement d'avoir encore
  // le focus sur #round-trip-distance-input juste après avoir cliqué
  // "Générer".
  document.addEventListener("keydown", (e) => {
    if (!pickingMode || e.key !== "Escape") return;
    stopPicking();
  });

  // Quitter l'onglet Boucle abandonne le mode "cliquez sur la carte" : son
  // indication n'y est plus visible, un clic produirait un effet inattendu.
  document.addEventListener(TAB_CHANGE_EVENT, (e) => {
    if (pickingMode && e.detail.tab !== "loop") stopPicking();
  });

  variantBtn.addEventListener("click", () => {
    const { roundTripVariant } = store.getState();
    if (!roundTripVariant) return;
    const seed = Math.floor(Math.random() * 1_000_000);
    generateFrom(roundTripVariant.start.lat, roundTripVariant.start.lon, roundTripVariant.distanceM, seed);
  });
}
