import { createRoute, getRoute, updateRoute } from "../api/saved-routes.js";
import { computeRoute, toApiAvoidZones, fromApiAvoidZones } from "../api/routing.js";
import { showRouteInfo, hideRouteInfo, showRouteError, hideRouteError, showBanner } from "../ui/sidebar.js";
import { refreshSavedRoutesList } from "../ui/saved-routes-list.js";
import { renderWaypointList } from "../ui/waypoint-list.js";
import { clearDraft } from "../state/draft-storage.js";
import { switchTab } from "../ui/tabs.js";
import { isSameRoute } from "../utils/route-match.js";

/**
 * Câble la sidebar "Trajet" : calcul et rendu du tracé courant, sauvegarde,
 * édition d'un trajet existant, effacement. Reçoit le store et les objets
 * carte déjà construits par main.js au lieu de les recréer ici.
 */
export function initRouteController({ store, waypointManager, routeLayer, draftAutosave }) {
  // Garde-fou "dernier appel gagne" : deux mutations rapprochées peuvent
  // lancer deux calculs concurrents — seul le plus récent des deux doit être
  // autorisé à mettre à jour le DOM à sa résolution.
  let recomputeSeq = 0;
  let currentComputation = Promise.resolve();
  // Même principe pour l'ouverture d'un trajet sauvegardé (chargement du
  // détail puis recalcul d'enrichissement) : seule la dernière ouverture
  // demandée s'applique, et toute remise à zéro annule celles en cours.
  let loadSeq = 0;

  function recomputeAndRender(waypoints) {
    currentComputation = computeAndRender(waypoints, ++recomputeSeq);
    return currentComputation;
  }

  async function computeAndRender(waypoints, seq) {
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

  /** Attend la fin du calcul déclenché par la dernière mutation : l'import
   * GPX et la génération de boucle s'en servent pour afficher leur bandeau
   * après le calcul, sans relancer eux-mêmes un second calcul identique. */
  function waitForRecompute() {
    return currentComputation;
  }

  function discardDraft() {
    draftAutosave?.cancel();
    clearDraft();
  }

  store.subscribe((state, meta) => {
    if (meta.silent) return;
    recomputeAndRender(state.waypoints);
  });

  let renderedWaypoints = null;
  let renderedRoute = null;
  store.subscribe((state) => {
    document.getElementById("undo-waypoint-btn").disabled = !waypointManager.canUndo();
    document.getElementById("redo-waypoint-btn").disabled = !waypointManager.canRedo();

    // La liste ne dépend que des points et du tracé : la reconstruire à
    // chaque notification (vitesse, zones…) coûtait inutilement.
    if (state.waypoints === renderedWaypoints && state.computedRoute === renderedRoute) return;
    renderedWaypoints = state.waypoints;
    renderedRoute = state.computedRoute;

    const wp = state.waypoints;
    document.getElementById("waypoint-list-panel").classList.toggle("hidden", wp.length === 0);
    renderWaypointList(wp, waypointManager, state.computedRoute);

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

  /** Remet le trajet courant à zéro : partagé par "Effacer le trajet" et
   * "Annuler" (édition) — corps strictement identique, dont un champ oublié
   * ici resterait invisible dans l'autre sans ce partage. */
  function resetRouteState() {
    loadSeq++;
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
    discardDraft();
  }

  document.getElementById("clear-route-btn").addEventListener("click", resetRouteState);

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
      refreshSavedRoutes();
      // Sans ça, le brouillon local survit à la sauvegarde : un rechargement
      // de page le restaure comme trajet non sauvegardé, et re-cliquer
      // "Sauvegarder" crée un doublon en base.
      discardDraft();
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
      refreshSavedRoutes();
      discardDraft();
    } catch (err) {
      if (err.status === 404) {
        leaveEditModeForDeletedRoute();
      } else {
        showRouteError(err.message);
      }
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("cancel-edit-btn").addEventListener("click", resetRouteState);

  /** Le trajet en cours de modification n'existe plus (supprimé depuis la
   * liste, ou depuis un autre appareil) : ses points restent affichés et
   * peuvent être sauvegardés comme nouveau trajet, au lieu d'échouer en 404
   * à chaque "Enregistrer les modifications". */
  function leaveEditModeForDeletedRoute() {
    store.setState({ editingRouteId: null }, { silent: true });
    showBanner(
      "Le trajet en cours de modification n'existe plus : ses points restent affichés, vous pouvez les sauvegarder comme nouveau trajet.",
      { type: "info" }
    );
  }

  function onRouteDeleted(route) {
    if (store.getState().editingRouteId === route.id) leaveEditModeForDeletedRoute();
  }

  /** Charge un trajet sauvegardé dans l'éditeur — partagé par les trois cas
   * d'usage (aperçu, édition, duplication), qui ne diffèrent que par
   * editingRouteId et le pré-remplissage du nom. Un champ d'état oublié ici
   * resterait sinon invisible dans les deux autres cas. */
  function applyLoadedRoute(route, { editingRouteId, prefillName = false } = {}) {
    // Ouvert depuis "Mes trajets" : on bascule là où ses points s'éditent.
    switchTab("route");
    // Le brouillon en cours est remplacé par ce trajet : sans ça, un
    // rechargement restaurait l'ancien brouillon à la place.
    discardDraft();
    waypointManager.setPointsSilently(route.waypoints);
    routeLayer.draw(route.geometry_geojson, []);
    showRouteInfo(route.distance_m, route.duration_s);
    hideRouteError();
    document.getElementById("route-description-input").value = route.description || "";
    // Incite à distinguer une copie de l'original, reste librement modifiable ;
    // hors duplication, aucun nom résiduel d'un chargement précédent.
    document.getElementById("save-route-name-input").value = prefillName ? `Copie de ${route.name}` : "";
    store.setState(
      {
        computedRoute: {
          distance_m: route.distance_m,
          duration_s: route.duration_s,
          geometry_geojson: route.geometry_geojson,
        },
        editingRouteId,
        avoidZones: fromApiAvoidZones(route.avoid_zones),
        speedLimitKmh: route.speed_limit_kmh ?? null,
        noSpeedLimit: route.no_speed_limit || false,
        pendingForcedPoint: null,
        roundTripVariant: null,
      },
      { silent: true }
    );
  }

  /** Ouvre un trajet de la liste : la liste ne contient que des résumés, le
   * détail (points, géométrie, options) est chargé ici. */
  async function openSavedRoute(summary, optionsFor) {
    const seq = ++loadSeq;
    let route;
    try {
      route = await getRoute(summary.id);
    } catch (err) {
      if (seq === loadSeq) showRouteError(err.message);
      return;
    }
    if (seq !== loadSeq) return;
    applyLoadedRoute(route, optionsFor(route));
    enrichLoadedRoute(route, seq);
  }

  /** Un trajet sauvegardé ne conserve que sa géométrie : sans recalcul, il
   * s'affichait sans couleurs de vitesse, sans distances par étape, et
   * glisser son tracé n'insérait pas l'étape au bon endroit. Le tracé
   * enregistré reste affiché immédiatement ; le recalcul ne le remplace que
   * s'il décrit bien le même trajet, et son échec (moteur indisponible)
   * passe inaperçu. */
  async function enrichLoadedRoute(route, seq) {
    const { waypoints, avoidZones, speedLimitKmh, noSpeedLimit } = store.getState();
    if (waypoints.length < 2) return;
    let result;
    try {
      result = await computeRoute(waypoints, avoidZones, speedLimitKmh, noSpeedLimit);
    } catch {
      return;
    }
    // Un autre trajet a été ouvert, ou les points modifiés entre-temps (ce
    // qui déclenche déjà son propre calcul).
    if (seq !== loadSeq || store.getState().waypoints !== waypoints) return;
    if (!isSameRoute(route.distance_m, result.distance_m)) return;
    routeLayer.draw(result.geometry_geojson, result.max_speed_by_segment, result.leg_boundaries);
    showRouteInfo(result.distance_m, result.duration_s);
    store.setState({ computedRoute: result }, { silent: true });
  }

  function loadSavedRoute(summary) {
    return openSavedRoute(summary, () => ({ editingRouteId: null }));
  }

  function enterEditMode(summary) {
    return openSavedRoute(summary, (route) => ({ editingRouteId: route.id }));
  }

  /** Identique à loadSavedRoute, mais avec editingRouteId: null : "Sauvegarder"
   * crée alors une nouvelle entrée plutôt que de modifier l'original. */
  function duplicateRoute(summary) {
    return openSavedRoute(summary, () => ({ editingRouteId: null, prefillName: true }));
  }

  const savedRoutesHandlers = {
    onSelect: loadSavedRoute,
    onEdit: enterEditMode,
    onDuplicate: duplicateRoute,
    onDeleted: onRouteDeleted,
  };

  function refreshSavedRoutes() {
    refreshSavedRoutesList(savedRoutesHandlers);
  }

  refreshSavedRoutes();

  return { recomputeAndRender, waitForRecompute };
}
