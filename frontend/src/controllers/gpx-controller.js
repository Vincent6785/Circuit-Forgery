import { importGpx } from "../api/gpx.js";
import { showRouteError, showBanner } from "../ui/sidebar.js";

/** Câble l'input d'import GPX de la sidebar : les points sont extraits puis
 * recalculés via le moteur de routage habituel, jamais rejoués tels quels,
 * pour que le filtre anti-80km/h s'applique aussi aux trajets importés. */
export function initGpxController({ store, waypointManager, recomputeAndRender }) {
  document.getElementById("gpx-import-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // sans ça, réimporter le même fichier ne redéclenche pas "change"
    if (!file) return;
    try {
      const { waypoints, truncated } = await importGpx(file);
      waypointManager.replaceAll(waypoints);
      store.setState({ editingRouteId: null }, { silent: true });
      // replaceAll ci-dessus a déjà déclenché un recalcul en fire-and-forget ;
      // on attend explicitement sa fin pour que le bandeau de troncature
      // affiché plus bas ne soit pas écrasé par le hideRouteError()/
      // showRouteError() de ce calcul une fois qu'il se résout.
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
