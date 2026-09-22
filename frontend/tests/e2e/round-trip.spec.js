import { test, expect } from "@playwright/test";
import { clickMapAt, dragZone, openRouteOptions, openTab, setupParisView } from "./helpers.js";

async function setupView(page) {
  await setupParisView(page);
  await openTab(page, "loop");
}

// Le seed de round_trip n'est pas garanti reproductible à l'identique d'une
// version de GraphHopper à l'autre : on vérifie ici le contrat (≥2
// waypoints, distance proche de la cible, tracé fermé), pas l'exactitude
// géométrique.
test("génération d'un circuit en boucle depuis un point cliqué", async ({ page }) => {
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);

  await clickMapAt(page, 48.8566, 2.3522);

  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints.length).toBeGreaterThanOrEqual(2);
  // Un emplacement reste réservé sous la limite de 100 waypoints
  // (CF_MAX_WAYPOINTS, backend/app/routers/routes.py::compute_round_trip),
  // pour qu'une mutation ultérieure ne la dépasse pas aussitôt.
  expect(waypoints.length).toBeLessThan(100);

  const distanceText = await page.locator("#route-distance").textContent();
  const distanceKm = parseFloat(distanceText);
  expect(distanceKm).toBeGreaterThan(5);
  expect(distanceKm).toBeLessThan(30);

  await expect(page.locator("#round-trip-variant-btn")).toBeEnabled();

  // Un vrai circuit round_trip renvoie bien plus de points bruts que
  // max_waypoints (environ 280 pour 15km, contre 100) : le bandeau de
  // simplification s'affiche donc systématiquement en pratique, pas
  // seulement sur un cas limite artificiel.
  const banner = page.locator("#route-error");
  await expect(banner).not.toHaveClass(/hidden/);
  await expect(banner).toHaveClass(/info/);
  await expect(banner).not.toHaveClass(/error/);
  await expect(banner).toContainText(/trop dense/);
});

test("ajouter un point après un circuit dense ne dépasse pas la limite de waypoints", async ({ page }) => {
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  // Un circuit à 15km est systématiquement dense (voir le test précédent),
  // donc proche du plafond de waypoints ; la marge réservée à la génération
  // doit suffire à en ajouter un de plus sans déclencher l'erreur backend
  // "Trop de waypoints".
  await clickMapAt(page, 48.86, 2.34);
  await page.waitForTimeout(500);

  const banner = page.locator("#route-error");
  await expect(banner).not.toHaveClass(/error/);
});

test("le bouton fermer la boucle est déjà désactivé après génération d'un circuit", async ({ page }) => {
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  // Un circuit round_trip revient exactement au point de départ snappé
  // (vérifié empiriquement contre GraphHopper) : "Fermer la boucle" n'a
  // donc rien à faire, et le bouton se désactive déjà tout seul.
  await expect(page.locator("#close-loop-btn")).toBeDisabled();
});

test("Échap annule le mode génération sans créer de circuit", async ({ page }) => {
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);

  // Le clic suivant doit redevenir un ajout de point ordinaire, pas
  // déclencher une génération de circuit.
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(1);
});

test("le bouton Annuler sort du mode génération sans créer de circuit", async ({ page }) => {
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);

  await page.locator("#round-trip-cancel-btn").click();
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);

  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});

test("le clic normal sur la carte n'ajoute pas de point tant qu'aucune génération n'est demandée", async ({
  page,
}) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});

test("fermer la boucle ajoute le point de départ en fin de trajet", async ({ page }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  await expect(page.locator("#close-loop-btn")).toBeEnabled();
  await page.locator("#close-loop-btn").click();

  await expect(page.locator("#waypoint-list li")).toHaveCount(3);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints[0].lat).toBeCloseTo(waypoints[2].lat, 5);
  expect(waypoints[0].lon).toBeCloseTo(waypoints[2].lon, 5);

  // La boucle est désormais fermée : le bouton se désactive à nouveau.
  await expect(page.locator("#close-loop-btn")).toBeDisabled();
});

/** Pose des points de passage imposés puis sort du mode de pose. */
async function addForcedPoints(page, points) {
  await page.locator("#round-trip-forced-point-btn").click();
  for (const [lat, lon] of points) await clickMapAt(page, lat, lon);
  await expect(page.locator("#round-trip-forced-point-list li")).toHaveCount(points.length);
  await page.keyboard.press("Escape");
}

/** Le circuit passe-t-il par ce point ? Les points de passage sont insérés
 * tels quels dans les waypoints, sans accrochage au réseau routier. */
function includesPoint(waypoints, lat, lon) {
  return waypoints.some((w) => Math.abs(w.lat - lat) < 1e-4 && Math.abs(w.lon - lon) < 1e-4);
}

test("un point de passage défini est bien inséré dans le circuit généré", async ({ page }) => {
  await setupView(page);

  await page.locator("#round-trip-forced-point-btn").click();
  await expect(page.locator("#round-trip-hint-text")).toContainText("devra traverser");
  await clickMapAt(page, 48.87, 2.34);
  // Le mode de pose reste actif pour en enchaîner d'autres : seul Échap,
  // "Terminer" ou le bouton lui-même en sortent.
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);
  await expect(page.locator("#round-trip-forced-point-panel")).not.toHaveClass(/hidden/);
  await page.keyboard.press("Escape");

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(includesPoint(waypoints, 48.87, 2.34)).toBe(true);
});

test("plusieurs points de passage sont tous traversés par le circuit généré", async ({ page }) => {
  await setupView(page);

  const forced = [
    [48.875, 2.34],
    [48.855, 2.30],
    [48.85, 2.355],
  ];
  await addForcedPoints(page, forced);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  for (const [lat, lon] of forced) expect(includesPoint(waypoints, lat, lon)).toBe(true);
  // Le circuit reste sous le plafond de waypoints malgré les points ajoutés :
  // le backend réserve leurs emplacements en échantillonnant d'autant moins
  // finement, sinon le recalcul déclenché juste après échouerait.
  expect(waypoints.length).toBeLessThan(100);
  await expect(page.locator("#route-error")).not.toHaveClass(/error/);
});

test("retirer un seul point de passage laisse les autres en place", async ({ page }) => {
  await setupView(page);

  await addForcedPoints(page, [
    [48.875, 2.34],
    [48.855, 2.30],
  ]);

  await page.locator("#round-trip-forced-point-list li").first().locator("button").click();
  await expect(page.locator("#round-trip-forced-point-list li")).toHaveCount(1);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(includesPoint(waypoints, 48.875, 2.34)).toBe(false);
  expect(includesPoint(waypoints, 48.855, 2.30)).toBe(true);
});

test("Échap pendant le mode point de passage n'en définit aucun", async ({ page }) => {
  await setupView(page);

  await page.locator("#round-trip-forced-point-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);
  await expect(page.locator("#round-trip-forced-point-panel")).toHaveClass(/hidden/);

  // Le clic suivant doit redevenir un ajout de point ordinaire.
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});

test("retirer les points de passage avant génération les exclut du circuit", async ({ page }) => {
  await setupView(page);

  await addForcedPoints(page, [
    [48.87, 2.34],
    [48.855, 2.30],
  ]);

  await page.locator("#round-trip-forced-point-clear-btn").click();
  await expect(page.locator("#round-trip-forced-point-panel")).toHaveClass(/hidden/);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(includesPoint(waypoints, 48.87, 2.34)).toBe(false);
  expect(includesPoint(waypoints, 48.855, 2.30)).toBe(false);
});

test("Effacer les points retire aussi les points de passage en attente", async ({ page }) => {
  // Régression : forcedPoint vivait en variable locale au contrôleur
  // round-trip, invisible du reset fait par "Effacer les points" (qui ne
  // connaît que le store) — le marqueur restait affiché et le point était
  // quand même appliqué à la génération suivante malgré le "reset" affiché.
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);

  await addForcedPoints(page, [
    [48.87, 2.34],
    [48.855, 2.30],
  ]);

  await page.locator("#clear-route-btn").click();
  await expect(page.locator("#round-trip-forced-point-panel")).toHaveClass(/hidden/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(0);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(includesPoint(waypoints, 48.87, 2.34)).toBe(false);
  expect(includesPoint(waypoints, 48.855, 2.30)).toBe(false);
});

test("Effacer les points désactive Nouvelle variante et régénère avec le bon point de départ après", async ({
  page,
}) => {
  // Régression : lastStart/lastDistanceM vivaient en variables locales au
  // contrôleur round-trip, invisibles du reset fait par "Effacer les
  // points" (même classe de bug que le point de passage juste au-dessus) —
  // "Nouvelle variante" restait activé et régénérait un circuit sans
  // rapport avec l'ancien point de départ, écrasant silencieusement ce qui
  // venait d'être effacé.
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await expect(page.locator("#round-trip-variant-btn")).toBeEnabled();

  await page.locator("#clear-route-btn").click();
  await expect(page.locator("#round-trip-variant-btn")).toBeDisabled();
  await expect(page.locator("#waypoint-list li")).toHaveCount(0);
});

test("générer un circuit en boucle avec une zone à éviter active ne plante pas", async ({ page }) => {
  // Régression : RoundTripRequest n'avait pas de champ avoid_zones, la
  // génération de circuit ignorait totalement les zones à éviter déjà
  // définies — jamais exercé par un test e2e avant ce cas, seul un test
  // unitaire mocké couvrait le nouveau champ.
  await setupView(page);

  await openRouteOptions(page);
  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
  // Le mode dessin reste actif après une zone (pour en enchaîner plusieurs) :
  // le désactiver explicitement, sinon le clic de génération ci-dessous
  // dessinerait une seconde zone au lieu de fixer le point de départ.
  await page.locator("#avoid-zone-toggle-btn").click();

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);

  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });
  const banner = page.locator("#route-error");
  await expect(banner).not.toHaveClass(/error/);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints.length).toBeGreaterThanOrEqual(2);
});

test("inverser le sens inverse l'ordre des waypoints", async ({ page }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await clickMapAt(page, 48.87, 2.36);

  const before = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));
  await page.locator("#reverse-route-btn").click();
  const after = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));

  expect(after).toEqual([...before].reverse());
});

test("quitter l'onglet Boucle annule le mode génération en attente", async ({ page }) => {
  await setupView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);

  await openTab(page, "route");
  await openTab(page, "loop");
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);

  // Le clic suivant redevient un ajout de point ordinaire.
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});
