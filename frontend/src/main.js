import "./style.css";
import { createStore } from "./state/store.js";
import { createHistory } from "./state/history.js";
import { createMap } from "./map/map.js";
import { WaypointManager } from "./map/markers.js";
import { RouteLayer } from "./map/route-layer.js";
import { RouteInsertInteraction } from "./map/route-insert-interaction.js";
import { showRouteInfo, showRouteError, hideRouteError } from "./ui/sidebar.js";
import { initTabs } from "./ui/tabs.js";
import { initRouteOptionsSummary } from "./ui/route-options-summary.js";
import { POILayer } from "./map/poi-layer.js";
import { openPoiCreationPopup } from "./ui/poi-form-popup.js";
import { refreshPoiList } from "./ui/poi-list.js";
import { createPOI } from "./api/poi.js";
import { initDraftAutosave } from "./state/draft-autosave.js";
import { loadDraft } from "./state/draft-storage.js";
import { initRouteController } from "./controllers/route-controller.js";
import { initItineraryController } from "./controllers/itinerary-controller.js";
import { initGpxController } from "./controllers/gpx-controller.js";
import { initRoundTripController } from "./controllers/round-trip-controller.js";
import { initAvoidZoneController } from "./controllers/avoid-zone-controller.js";
import { initSpeedLimitController } from "./controllers/speed-limit-controller.js";
import { initRouteAlternatives } from "./ui/route-alternatives.js";
import { indexForRouteDrop } from "./utils/itinerary.js";

initTabs();

const map = createMap("map");
window.__map = map; // exposé uniquement pour Playwright (latLngToContainerPoint pour simuler des clics)

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
  pendingForcedPoint: null, // {lat, lon} | null — point de passage pour la prochaine génération de circuit en boucle
  roundTripVariant: null, // {start: {lat, lon}, distanceM} | null — dernier circuit en boucle généré avec succès, pour "Nouvelle variante"
});

const history = createHistory();
const waypointManager = new WaypointManager(map, store, history);
window.__getWaypoints = () => waypointManager.getPoints(); // exposé uniquement pour Playwright
window.__getAvoidZones = () => store.getState().avoidZones; // exposé uniquement pour Playwright
window.__getSpeedLimit = () => ({
  speedLimitKmh: store.getState().speedLimitKmh,
  noSpeedLimit: store.getState().noSpeedLimit,
}); // exposé uniquement pour Playwright

const draftAutosave = initDraftAutosave(store);
// Une modification faite juste avant de fermer l'onglet (dans le délai de
// l'autosave) serait sinon perdue.
window.addEventListener("pagehide", () => draftAutosave.flush());

const { recomputeAndRender, waitForRecompute } = initRouteController({
  store,
  waypointManager,
  routeLayer,
  draftAutosave,
});
initItineraryController({ map, store, waypointManager });
initGpxController({ store, waypointManager, waitForRecompute });
initRoundTripController({ map, store, waypointManager, waitForRecompute });
initAvoidZoneController({ map, store, waypointManager, history });
initSpeedLimitController({ store });
initRouteOptionsSummary(store);
initRouteAlternatives({ store, routeLayer });

const poiLayer = new POILayer(map);

function refreshPoi() {
  refreshPoiList(
    (poi) => poiLayer.panTo(poi),
    (pois) => poiLayer.render(pois)
  );
}

map.on("contextmenu", (e) => {
  openPoiCreationPopup(map, e.latlng, async (poi) => {
    try {
      await createPOI(poi);
      hideRouteError();
      refreshPoi();
    } catch (err) {
      showRouteError(err.message);
    }
  });
});

refreshPoi();

// Restaure le brouillon local : sans ça, un trajet non sauvegardé serait perdu au rechargement.
const draft = loadDraft();
if (draft && draft.waypoints?.length > 0) {
  waypointManager.setPointsSilently(draft.waypoints);
  store.setState(
    {
      avoidZones: draft.avoidZones || [],
      speedLimitKmh: draft.speedLimitKmh ?? null,
      noSpeedLimit: draft.noSpeedLimit || false,
      pendingForcedPoint: draft.pendingForcedPoint ?? null,
      roundTripVariant: draft.roundTripVariant ?? null,
      editingRouteId: draft.editingRouteId ?? null,
    },
    { silent: true }
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
    store.setState({ computedRoute: draft.computedRoute }, { silent: true });
  } else if (draft.waypoints.length >= 2) {
    recomputeAndRender(draft.waypoints);
  }
}
