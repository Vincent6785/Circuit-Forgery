import "./style.css";
import { createStore } from "./state/store.js";
import { createHistory } from "./state/history.js";
import { createMap } from "./map/map.js";
import { WaypointManager } from "./map/markers.js";
import { RouteLayer } from "./map/route-layer.js";
import { RouteInsertInteraction } from "./map/route-insert-interaction.js";
import { showRouteInfo, hideRouteError } from "./ui/sidebar.js";
import { initTabs } from "./ui/tabs.js";
import { initRouteOptionsSummary } from "./ui/route-options-summary.js";
import { POILayer } from "./map/poi-layer.js";
import { openPoiCreationPopup } from "./ui/poi-form-popup.js";
import { refreshPoiList } from "./ui/poi-list.js";
import { createPOI, getClientConfig } from "./api/poi.js";
import { initDraftAutosave } from "./state/draft-autosave.js";
import { loadDraft } from "./state/draft-storage.js";
import { initRouteController } from "./controllers/route-controller.js";
import { initItineraryController } from "./controllers/itinerary-controller.js";
import { initGpxController } from "./controllers/gpx-controller.js";
import { initRoundTripController } from "./controllers/round-trip-controller.js";
import { initAvoidZoneController } from "./controllers/avoid-zone-controller.js";
import { initSpeedLimitController } from "./controllers/speed-limit-controller.js";
import { initRouteAlternatives } from "./ui/route-alternatives.js";
import { initBusyIndicator } from "./ui/busy-indicator.js";
import { initSidebarToggle } from "./ui/sidebar-toggle.js";
import { indexForRouteDrop } from "./utils/itinerary.js";

initTabs();

const { map, applyTileConfig } = createMap("map");
// Serveur de tuiles configuré côté backend : appliqué dès réception, sans
// retarder l'affichage (le fond par défaut s'affiche en attendant).
getClientConfig()
  .then(applyTileConfig)
  .catch((err) => console.warn("Configuration du fond de carte indisponible, fond par défaut conservé :", err));

const insertInteraction = new RouteInsertInteraction(
  map,
  (segmentIndex, legBoundaries, lat, lon) => {
    const index = indexForRouteDrop(waypointManager.getPoints(), legBoundaries, segmentIndex, { lat, lon });
    waypointManager.insertPointAt(index, lat, lon);
  },
  // Suspendue, comme l'ajout au clic, pendant un autre mode "prochain clic =
  // …" (génération de boucle, dessin de zone).
  { isEnabled: () => waypointManager.isAddOnMapClickEnabled() }
);
const routeLayer = new RouteLayer(map, insertInteraction);

const store = createStore({
  waypoints: [], // liste de {id, lat, lon, label}
  computedRoute: null, // ComputeRouteResponse, ou null tant qu'aucun trajet n'est calculé
  editingRouteId: null, // id du trajet sauvegardé en cours d'édition, ou null hors édition
  avoidZones: [], // liste de {lat, lon, radiusM}
  speedLimitKmh: null, // seuil personnalisé (20-80), ou null = défaut du profil (80)
  noSpeedLimit: false, // true = profil sans exclusion de vitesse
  pendingForcedPoints: [], // liste de {lat, lon} — points de passage imposés à la prochaine génération de circuit en boucle
  roundTripVariant: null, // {start: {lat, lon}, distanceM} | null — dernier circuit en boucle généré avec succès, pour "Nouvelle variante"
});

const history = createHistory();
const waypointManager = new WaypointManager(map, store, history);
// Accès internes pour les tests Playwright uniquement : absents du build de
// production (VITE_E2E_HOOKS n'est défini que pour la stack de test, cf.
// docker-compose.e2e.yml), et retirés du bundle par Vite dans ce cas.
if (import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === "true") {
  window.__map = map;
  window.__getWaypoints = () => waypointManager.getPoints();
  window.__getAvoidZones = () => store.getState().avoidZones;
  window.__getComputedRoute = () => store.getState().computedRoute;
  window.__getSpeedLimit = () => ({
    speedLimitKmh: store.getState().speedLimitKmh,
    noSpeedLimit: store.getState().noSpeedLimit,
  });
}

const draftAutosave = initDraftAutosave(store);
// Une modification faite juste avant de fermer l'onglet (dans le délai de
// l'autosave) serait sinon perdue.
window.addEventListener("pagehide", () => draftAutosave.flush());

// Indicateur "Calcul en cours…" partagé par toutes les opérations attendues.
const trackBusy = initBusyIndicator();

const { recomputeAndRender, waitForRecompute } = initRouteController({
  store,
  waypointManager,
  routeLayer,
  draftAutosave,
  trackBusy,
});
initItineraryController({ map, store, waypointManager });
initGpxController({ store, waypointManager, waitForRecompute, trackBusy });
initRoundTripController({ map, store, waypointManager, waitForRecompute, trackBusy });
initAvoidZoneController({ map, store, waypointManager, history });
initSpeedLimitController({ store });
initRouteOptionsSummary(store);
initRouteAlternatives({ store, routeLayer, trackBusy });
initSidebarToggle({ map });

const poiLayer = new POILayer(map);

function refreshPoi() {
  refreshPoiList(
    (poi) => poiLayer.panTo(poi),
    (pois) => poiLayer.render(pois)
  );
}

map.on("contextmenu", (e) => {
  // Le formulaire affiche lui-même l'erreur et reste ouvert si l'enregistrement échoue.
  openPoiCreationPopup(map, e.latlng, async (poi) => {
    await createPOI(poi);
    hideRouteError();
    refreshPoi();
  });
});

refreshPoi();

/** Points de passage d'un brouillon. Un brouillon écrit avant le passage au
 * multi-points n'en contient qu'un seul, sous `pendingForcedPoint` : le
 * reprendre évite de le perdre silencieusement à la première ouverture après
 * mise à jour.
 * @param {Record<string, any>} draft */
function restoredForcedPoints(draft) {
  if (Array.isArray(draft.pendingForcedPoints)) return draft.pendingForcedPoints;
  return draft.pendingForcedPoint ? [draft.pendingForcedPoint] : [];
}

// Restaure le brouillon local : sans ça, un trajet non sauvegardé serait perdu au rechargement.
const draft = loadDraft();
if (draft && draft.waypoints?.length > 0) {
  waypointManager.setPointsSilently(draft.waypoints);
  store.setState(
    {
      avoidZones: draft.avoidZones || [],
      speedLimitKmh: draft.speedLimitKmh ?? null,
      noSpeedLimit: draft.noSpeedLimit || false,
      pendingForcedPoints: restoredForcedPoints(draft),
      roundTripVariant: draft.roundTripVariant ?? null,
      editingRouteId: draft.editingRouteId ?? null,
    }
  );
  // Un tracé enregistré pour un autre nombre de points (brouillon écrit par
  // une version antérieure, qui sauvegardait le tracé précédent) est
  // recalculé plutôt qu'affiché.
  const routeMatchesPoints = draft.computedRoute?.leg_boundaries?.length === draft.waypoints.length;
  if (routeMatchesPoints) {
    routeLayer.draw(
      draft.computedRoute.geometry_geojson,
      draft.computedRoute.max_speed_by_segment,
      draft.computedRoute.leg_boundaries
    );
    showRouteInfo(draft.computedRoute.distance_m, draft.computedRoute.duration_s);
    store.setState({ computedRoute: draft.computedRoute });
  } else if (draft.waypoints.length >= 2) {
    recomputeAndRender(draft.waypoints);
  }
}
