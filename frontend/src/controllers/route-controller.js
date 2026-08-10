import { createRoute, updateRoute } from "../api/saved-routes.js";
import { computeRoute, toApiAvoidZones, fromApiAvoidZones } from "../api/routing.js";
import { showRouteInfo, hideRouteInfo, showRouteError, hideRouteError } from "../ui/sidebar.js";
import { refreshSavedRoutesList } from "../ui/saved-routes-list.js";
import { renderWaypointList } from "../ui/waypoint-list.js";
import { clearDraft } from "../state/draft-storage.js";

/**
 * Câble la sidebar "Trajet" : calcul et rendu du tracé courant, sauvegarde,
 * édition d'un trajet existant, effacement. Reçoit le store et les objets
 * carte déjà construits par main.js au lieu de les recréer ici.
 */
export function initRouteController({ store, waypointManager, routeLayer }) {
  // Garde-fou "dernier appel gagne" : deux mutations rapprochées (par
  // exemple un import GPX, qui déclenche à la fois la notification
  // automatique du store et un appel explicite pour séquencer un message
  // post-recalcul) peuvent lancer deux calculs concurrents — seul le plus
  // récent des deux doit être autorisé à mettre à jour le DOM à sa résolution.
  let recomputeSeq = 0;

  async function recomputeAndRender(waypoints) {
    const seq = ++recomputeSeq;
    if (waypoints.length < 2) {
      routeLayer.clear();
      hideRouteInfo();
      hideRouteError();
      store.setState({ computedRoute: null }, { silent: true });
      return;
    }
    try {
      const { avoidZones, speedLimitKmh, noSpeedLimit } = store.getState();
      const result = await computeRoute(waypoints, avoidZones, speedLimitKmh, noSpeedLimit);
      if (seq !== recomputeSeq) return;
      hideRouteError();
      routeLayer.draw(result.geometry_geojson, result.max_speed_by_segment, result.leg_boundaries);
      showRouteInfo(result.distance_m, result.duration_s);
      store.setState({ computedRoute: result }, { silent: true });
    } catch (err) {
      if (seq !== recomputeSeq) return;
      showRouteError(err.message);
    }
  }

  store.subscribe((state, meta) => {
    if (meta.silent) return;
    recomputeAndRender(state.waypoints);
  });

  store.subscribe((state) => {
    const panel = document.getElementById("waypoint-list-panel");
    panel.classList.toggle("hidden", state.waypoints.length === 0);
    renderWaypointList(state.waypoints, waypointManager, state.computedRoute);
    document.getElementById("undo-waypoint-btn").disabled = !waypointManager.canUndo();
    document.getElementById("redo-waypoint-btn").disabled = !waypointManager.canRedo();

    const wp = state.waypoints;
    const first = wp[0];
    const last = wp[wp.length - 1];
    const alreadyClosed = wp.length >= 2 && first.lat === last.lat && first.lon === last.lon;
    document.getElementById("close-loop-btn").disabled = wp.length < 2 || alreadyClosed;
    document.getElementById("reverse-route-btn").disabled = wp.length < 2;
  });

  document.getElementById("undo-waypoint-btn").addEventListener("click", () => waypointManager.undo());
  document.getElementById("redo-waypoint-btn").addEventListener("click", () => waypointManager.redo());

  document.getElementById("close-loop-btn").addEventListener("click", () => {
    const { waypoints } = store.getState();
    if (waypoints.length < 2) return;
    const first = waypoints[0];
    waypointManager.addPoint(first.lat, first.lon, first.label);
  });

  document.getElementById("reverse-route-btn").addEventListener("click", () => {
    waypointManager.reverseAll();
  });

  store.subscribe((state) => {
    const editing = state.editingRouteId !== null;
    document.getElementById("save-route-btn").classList.toggle("hidden", editing);
    document.getElementById("save-route-name-input").classList.toggle("hidden", editing);
    document.getElementById("update-route-btn").classList.toggle("hidden", !editing);
    document.getElementById("cancel-edit-btn").classList.toggle("hidden", !editing);
  });

  document.getElementById("clear-route-btn").addEventListener("click", () => {
    waypointManager.clear();
    store.setState(
      {
        editingRouteId: null,
        avoidZones: [],
        speedLimitKmh: null,
        noSpeedLimit: false,
        pendingForcedPoint: null,
        roundTripVariant: null,
      },
      { silent: true }
    );
    document.getElementById("route-description-input").value = "";
    clearDraft();
  });

  document.getElementById("save-route-btn").addEventListener("click", async (e) => {
    const { waypoints, computedRoute, avoidZones, speedLimitKmh, noSpeedLimit } = store.getState();
    if (!computedRoute) return;
    const nameInput = document.getElementById("save-route-name-input");
    const descriptionInput = document.getElementById("route-description-input");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await createRoute({
        name,
        description: descriptionInput.value.trim() || null,
        waypoints: waypoints.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label || null })),
        distance_m: computedRoute.distance_m,
        duration_s: computedRoute.duration_s,
        geometry_geojson: computedRoute.geometry_geojson,
        avoid_zones: toApiAvoidZones(avoidZones),
        speed_limit_kmh: speedLimitKmh,
        no_speed_limit: noSpeedLimit,
      });
      hideRouteError();
      nameInput.value = "";
      descriptionInput.value = "";
      refreshSavedRoutesList(loadSavedRoute, enterEditMode, duplicateRoute);
    } catch (err) {
      showRouteError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("update-route-btn").addEventListener("click", async (e) => {
    const { waypoints, computedRoute, editingRouteId, avoidZones, speedLimitKmh, noSpeedLimit } = store.getState();
    if (!computedRoute || editingRouteId === null) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateRoute(editingRouteId, {
        description: document.getElementById("route-description-input").value.trim() || null,
        waypoints: waypoints.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label || null })),
        distance_m: computedRoute.distance_m,
        duration_s: computedRoute.duration_s,
        geometry_geojson: computedRoute.geometry_geojson,
        avoid_zones: toApiAvoidZones(avoidZones),
        speed_limit_kmh: speedLimitKmh,
        no_speed_limit: noSpeedLimit,
      });
      hideRouteError();
      store.setState({ editingRouteId: null }, { silent: true });
      refreshSavedRoutesList(loadSavedRoute, enterEditMode, duplicateRoute);
    } catch (err) {
      showRouteError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("cancel-edit-btn").addEventListener("click", () => {
    waypointManager.clear();
    store.setState(
      {
        editingRouteId: null,
        avoidZones: [],
        speedLimitKmh: null,
        noSpeedLimit: false,
        pendingForcedPoint: null,
        roundTripVariant: null,
      },
      { silent: true }
    );
    document.getElementById("route-description-input").value = "";
    clearDraft();
  });

  function loadSavedRoute(route) {
    waypointManager.setPointsSilently(route.waypoints);
    routeLayer.draw(route.geometry_geojson, []);
    showRouteInfo(route.distance_m, route.duration_s);
    hideRouteError();
    document.getElementById("route-description-input").value = route.description || "";
    store.setState(
      {
        computedRoute: {
          distance_m: route.distance_m,
          duration_s: route.duration_s,
          geometry_geojson: route.geometry_geojson,
        },
        editingRouteId: null,
        avoidZones: fromApiAvoidZones(route.avoid_zones),
        speedLimitKmh: route.speed_limit_kmh ?? null,
        noSpeedLimit: route.no_speed_limit || false,
        pendingForcedPoint: null,
        roundTripVariant: null,
      },
      { silent: true }
    );
  }

  function enterEditMode(route) {
    waypointManager.setPointsSilently(route.waypoints);
    routeLayer.draw(route.geometry_geojson, []);
    showRouteInfo(route.distance_m, route.duration_s);
    hideRouteError();
    document.getElementById("route-description-input").value = route.description || "";
    store.setState(
      {
        computedRoute: {
          distance_m: route.distance_m,
          duration_s: route.duration_s,
          geometry_geojson: route.geometry_geojson,
        },
        editingRouteId: route.id,
        avoidZones: fromApiAvoidZones(route.avoid_zones),
        speedLimitKmh: route.speed_limit_kmh ?? null,
        noSpeedLimit: route.no_speed_limit || false,
        pendingForcedPoint: null,
        roundTripVariant: null,
      },
      { silent: true }
    );
  }

  /** Identique à enterEditMode, mais avec editingRouteId: null : "Sauvegarder"
   * crée alors une nouvelle entrée plutôt que de modifier l'original. Le nom
   * est pré-rempli pour inciter à le distinguer, mais reste librement
   * modifiable, comme pour n'importe quel nouveau trajet. */
  function duplicateRoute(route) {
    waypointManager.setPointsSilently(route.waypoints);
    routeLayer.draw(route.geometry_geojson, []);
    showRouteInfo(route.distance_m, route.duration_s);
    hideRouteError();
    document.getElementById("route-description-input").value = route.description || "";
    document.getElementById("save-route-name-input").value = `Copie de ${route.name}`;
    store.setState(
      {
        computedRoute: {
          distance_m: route.distance_m,
          duration_s: route.duration_s,
          geometry_geojson: route.geometry_geojson,
        },
        editingRouteId: null,
        avoidZones: fromApiAvoidZones(route.avoid_zones),
        speedLimitKmh: route.speed_limit_kmh ?? null,
        noSpeedLimit: route.no_speed_limit || false,
        pendingForcedPoint: null,
        roundTripVariant: null,
      },
      { silent: true }
    );
  }

  refreshSavedRoutesList(loadSavedRoute, enterEditMode, duplicateRoute);

  return { recomputeAndRender };
}
