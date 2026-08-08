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

// Le seed de round_trip n'est pas garanti reproductible à l'identique entre
// versions de GraphHopper : on vérifie le contrat (≥2 waypoints, distance
// approximativement cible, tracé fermé), pas l'exactitude géométrique.
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
  // Une marge d'un emplacement est réservée sous la limite de 20 waypoints
  // (backend/app/routers/routes.py::compute_round_trip) pour qu'une
  // mutation ultérieure ne la dépasse pas immédiatement.
  expect(waypoints.length).toBeLessThan(20);

  const distanceText = await page.locator("#route-distance").textContent();
  const distanceKm = parseFloat(distanceText);
  expect(distanceKm).toBeGreaterThan(5);
  expect(distanceKm).toBeLessThan(30);

  await expect(page.locator("#round-trip-variant-btn")).toBeEnabled();

  // Un vrai circuit round_trip renvoie largement plus de points bruts que
  // max_waypoints (~280 pour 15km vs 20) : le bandeau de simplification
  // s'affiche donc en pratique systématiquement, pas seulement sur un cas
  // limite synthétique.
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

  // Un circuit à 15km est systématiquement dense (cf. test précédent) donc
  // proche du plafond de waypoints ; la marge réservée à la génération doit
  // permettre d'en ajouter un de plus sans déclencher l'erreur backend
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
  // (vérifié empiriquement contre GraphHopper) : pas besoin de "Fermer la
  // boucle", le bouton se désactive donc déjà tout seul.
  await expect(page.locator("#close-loop-btn")).toBeDisabled();
});

test("Échap annule le mode génération sans créer de circuit", async ({ page }) => {
  await setupParisView(page);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await expect(page.locator("#round-trip-hint")).not.toHaveClass(/hidden/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#round-trip-hint")).toHaveClass(/hidden/);

  // Le clic suivant doit redevenir un ajout de point normal, pas une
  // génération de circuit.
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

  // La boucle est fermée : le bouton se désactive à nouveau.
  await expect(page.locator("#close-loop-btn")).toBeDisabled();
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
