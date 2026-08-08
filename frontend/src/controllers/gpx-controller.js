import { importGpx } from "../api/gpx.js";
import { showRouteError, showBanner } from "../ui/sidebar.js";

/** Câble l'input d'import GPX de la sidebar : extraction + recalcul via le
 * moteur de routage habituel (pas de rejeu tel quel), pour que le filtre
 * anti->80km/h s'applique toujours aux trajets importés. */
export function initGpxController({ store, waypointManager, recomputeAndRender }) {
  document.getElementById("gpx-import-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // permet de réimporter le même fichier ensuite
    if (!file) return;
    try {
      const { waypoints, truncated } = await importGpx(file);
      waypointManager.replaceAll(waypoints);
      store.setState({ editingRouteId: null }, { silent: true });
      // Attend explicitement la fin du recalcul (déclenché aussi, en fire-and-forget,
      // par replaceAll ci-dessus) pour que le bandeau de troncature ci-dessous ne soit
      // pas écrasé par hideRouteError()/showRouteError() une fois ce calcul résolu.
      await recomputeAndRender(waypoints);
      if (truncated) {
        showBanner(
          "Le fichier GPX contenait plus de points que la limite autorisée : seuls les premiers points ont été conservés.",
          { type: "info" }
        );
      }
    } catch (err) {
      showRouteError(err.message);
    }
  });
}
