import { test, expect } from "@playwright/test";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);
}

async function clickMapAt(page, lat, lon) {
  const point = await page.evaluate(
    ([lat, lon]) => {
      const p = window.__map.latLngToContainerPoint([lat, lon]);
      return { x: p.x, y: p.y };
    },
    [lat, lon]
  );
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function dragZone(page, centerLat, centerLon, edgeLat, edgeLon) {
  const [centerPoint, edgePoint] = await page.evaluate(
    ([c, e]) => [window.__map.latLngToContainerPoint(c), window.__map.latLngToContainerPoint(e)],
    [
      [centerLat, centerLon],
      [edgeLat, edgeLon],
    ]
  );
  const box = await page.locator("#map").boundingBox();
  await page.mouse.move(box.x + centerPoint.x, box.y + centerPoint.y);
  await page.mouse.down();
  await page.mouse.move(box.x + edgePoint.x, box.y + edgePoint.y, { steps: 5 });
  await page.mouse.up();
}

// Le seed de round_trip n'est pas garanti reproductible à l'identique d'une
// version de GraphHopper à l'autre : on vérifie ici le contrat (≥2
// waypoints, distance proche de la cible, tracé fermé), pas l'exactitude
// géométrique.
test("génération d'un circuit en boucle depuis un point cliqué", async ({ page }) => {
  await setupParisView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);

  await clickMapAt(page, 48.8566, 2.3522);

  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints.length).toBeGreaterThanOrEqual(2);
  // Un emplacement reste réservé sous la limite de 20 waypoints
  // (backend/app/routers/routes.py::compute_round_trip), pour qu'une
  // mutation ultérieure ne la dépasse pas aussitôt.
  expect(waypoints.length).toBeLessThan(20);

  const distanceText = await page.locator("#route-distance").textContent();
  const distanceKm = parseFloat(distanceText);
  expect(distanceKm).toBeGreaterThan(5);
  expect(distanceKm).toBeLessThan(30);

  await expect(page.locator("#round-trip-variant-btn")).toBeEnabled();

  // Un vrai circuit round_trip renvoie bien plus de points bruts que
  // max_waypoints (environ 280 pour 15km, contre 20) : le bandeau de
  // simplification s'affiche donc systématiquement en pratique, pas
  // seulement sur un cas limite artificiel.
  const banner = page.locator("#route-error");
  await expect(banner).not.toHaveClass(/hidden/);
  await expect(banner).toHaveClass(/info/);
  await expect(banner).not.toHaveClass(/error/);
  await expect(banner).toContainText(/trop dense/);
});

test("ajouter un point après un circuit dense ne dépasse pas la limite de waypoints", async ({ page }) => {
  await setupParisView(page);

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
  await setupParisView(page);

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
  await setupParisView(page);

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
  await setupParisView(page);

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
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});

test("fermer la boucle ajoute le point de départ en fin de trajet", async ({ page }) => {
  await setupParisView(page);
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

test("un point de passage défini est bien inséré dans le circuit généré", async ({ page }) => {
  await setupParisView(page);

  await page.locator("#round-trip-forced-point-btn").click();
  await expect(page.locator("#round-trip-hint-text")).toContainText("devra traverser");
  await clickMapAt(page, 48.87, 2.34);
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);
  await expect(page.locator("#round-trip-forced-point-status")).not.toHaveClass(/hidden/);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  const hasForcedPoint = waypoints.some(
    (w) => Math.abs(w.lat - 48.87) < 1e-4 && Math.abs(w.lon - 2.34) < 1e-4
  );
  expect(hasForcedPoint).toBe(true);
});

test("Échap pendant le mode point de passage n'en définit aucun", async ({ page }) => {
  await setupParisView(page);

  await page.locator("#round-trip-forced-point-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);
  await expect(page.locator("#round-trip-forced-point-status")).toHaveClass(/hidden/);

  // Le clic suivant doit redevenir un ajout de point ordinaire.
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});

test("retirer le point de passage avant génération l'exclut du circuit", async ({ page }) => {
  await setupParisView(page);

  await page.locator("#round-trip-forced-point-btn").click();
  await clickMapAt(page, 48.87, 2.34);
  await expect(page.locator("#round-trip-forced-point-status")).not.toHaveClass(/hidden/);

  await page.locator("#round-trip-forced-point-clear-btn").click();
  await expect(page.locator("#round-trip-forced-point-status")).toHaveClass(/hidden/);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  const hasForcedPoint = waypoints.some(
    (w) => Math.abs(w.lat - 48.87) < 1e-4 && Math.abs(w.lon - 2.34) < 1e-4
  );
  expect(hasForcedPoint).toBe(false);
});

test("Effacer les points retire aussi un point de passage en attente", async ({ page }) => {
  // Régression : forcedPoint vivait en variable locale au contrôleur
  // round-trip, invisible du reset fait par "Effacer les points" (qui ne
  // connaît que le store) — le marqueur restait affiché et le point était
  // quand même appliqué à la génération suivante malgré le "reset" affiché.
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);

  await page.locator("#round-trip-forced-point-btn").click();
  await clickMapAt(page, 48.87, 2.34);
  await expect(page.locator("#round-trip-forced-point-status")).not.toHaveClass(/hidden/);

  await page.locator("#clear-route-btn").click();
  await expect(page.locator("#round-trip-forced-point-status")).toHaveClass(/hidden/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(0);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  const hasForcedPoint = waypoints.some(
    (w) => Math.abs(w.lat - 48.87) < 1e-4 && Math.abs(w.lon - 2.34) < 1e-4
  );
  expect(hasForcedPoint).toBe(false);
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
  await setupParisView(page);

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
  await setupParisView(page);

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
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await clickMapAt(page, 48.87, 2.36);

  const before = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));
  await page.locator("#reverse-route-btn").click();
  const after = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));

  expect(after).toEqual([...before].reverse());
});
