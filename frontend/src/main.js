import "./style.css";
import { createStore } from "./state/store.js";
import { createHistory } from "./state/history.js";
import { createMap } from "./map/map.js";
import { WaypointManager } from "./map/markers.js";
import { RouteLayer } from "./map/route-layer.js";
import { RouteInsertInteraction } from "./map/route-insert-interaction.js";
import { showRouteInfo, showRouteError, hideRouteError } from "./ui/sidebar.js";
import { initAddressSearch } from "./ui/address-search.js";
import { POILayer } from "./map/poi-layer.js";
import { openPoiCreationPopup } from "./ui/poi-form-popup.js";
import { refreshPoiList } from "./ui/poi-list.js";
import { createPOI } from "./api/poi.js";
import { initDraftAutosave } from "./state/draft-autosave.js";
import { loadDraft } from "./state/draft-storage.js";
import { initRouteController } from "./controllers/route-controller.js";
import { initGpxController } from "./controllers/gpx-controller.js";
import { initRoundTripController } from "./controllers/round-trip-controller.js";
import { initAvoidZoneController } from "./controllers/avoid-zone-controller.js";
import { initRouteAlternatives } from "./ui/route-alternatives.js";

const map = createMap("map");
window.__map = map; // exposé uniquement pour Playwright (latLngToContainerPoint pour simuler des clics)

const insertInteraction = new RouteInsertInteraction(map, (legIndex, lat, lon) => {
  waypointManager.insertPointAt(legIndex + 1, lat, lon);
});
const routeLayer = new RouteLayer(map, insertInteraction);

const store = createStore({
  waypoints: [], // liste de {id, lat, lon}
  computedRoute: null, // ComputeRouteResponse, ou null tant qu'aucun trajet n'est calculé
  editingRouteId: null, // id du trajet sauvegardé en cours d'édition, ou null hors édition
  avoidZones: [], // liste de {lat, lon, radiusM}
});

const history = createHistory();
const waypointManager = new WaypointManager(map, store, history);
window.__getWaypoints = () => waypointManager.getPoints(); // exposé uniquement pour Playwright
window.__getAvoidZones = () => store.getState().avoidZones; // exposé uniquement pour Playwright

initDraftAutosave(store);

const { recomputeAndRender } = initRouteController({ store, waypointManager, routeLayer });
initGpxController({ store, waypointManager, recomputeAndRender });
initRoundTripController({ map, store, waypointManager, recomputeAndRender });
initAvoidZoneController({ map, store, waypointManager, history });
initRouteAlternatives({ store, routeLayer });

initAddressSearch((lat, lon) => {
  map.setView([lat, lon], 14);
  waypointManager.addPoint(lat, lon);
});

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
  store.setState({ avoidZones: draft.avoidZones || [] }, { silent: true });
  if (draft.computedRoute) {
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
