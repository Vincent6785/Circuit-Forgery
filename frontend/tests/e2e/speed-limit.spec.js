import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);
}

// Le Havre / Honfleur, de part et d'autre du Pont de Normandie (max_speed > 80,
// donc exclu par défaut). Vérifié empiriquement contre le backend réel avant
// d'écrire ce test : ~91 km en détour par défaut (moto_no_fast). Avec
// "Aucune limite" (profil moto_no_limit), le pont redevient utilisable mais
// route_class MOTORWAY/TRUNK reste fortement pénalisé (×0.02, comme dans
// moto_no_fast) — pas une bascule vers l'itinéraire le plus direct possible
// (~25 km avec un profil "car" neutre) : ~70 km observés, un compromis entre
// éviter les grands axes et accepter d'en emprunter un pour un franchissement
// sans alternative raisonnable.
const LE_HAVRE = { lat: 49.4938, lon: 0.1077 };
const HONFLEUR = { lat: 49.4189, lon: 0.2333 };

async function setupNormandyView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([49.456, 0.17], 11, { animate: false }));
  await page.waitForTimeout(300);
}

test("abaisser la limite de vitesse resserre le filtre appliqué au trajet", async ({ page, request }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.fill("#speed-limit-input", "50");
  await page.waitForTimeout(800);

  await expect(page.locator("#route-error")).not.toHaveClass(/error/);

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  const resp = await request.post("/api/routes/compute", {
    data: {
      waypoints: waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
      speed_limit_kmh: 50,
    },
  });
  const data = await resp.json();
  const speeds = (data.max_speed_by_segment || []).filter((s) => s !== null);
  for (const speed of speeds) {
    expect(speed).toBeLessThanOrEqual(50);
  }
});

test("générer un circuit en boucle avec un seuil de vitesse resserré actif ne plante pas", async ({ page }) => {
  // Régression : la branche POST de route_round_trip() (déclenchée par un
  // seuil resserré, cf. graphhopper_client.py) envoyait un corps JSON
  // invalide ("point" au lieu de "points"), rejeté par GraphHopper avec
  // "You have to pass at least one point" — jamais exercé par un test e2e
  // avant ce cas, seul un test unitaire mocké couvrait cette branche.
  await setupParisView(page);
  await page.fill("#speed-limit-input", "50");
  await page.waitForTimeout(500);

  await page.fill("#round-trip-distance-input", "15");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);

  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 10000 });
  const banner = page.locator("#route-error");
  await expect(banner).not.toHaveClass(/error/);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints.length).toBeGreaterThanOrEqual(2);
});

test("un seuil personnalisé hors bornes est rejeté par le backend", async ({ request }) => {
  const resp = await request.post("/api/routes/compute", {
    data: {
      waypoints: [
        { lat: 48.8566, lon: 2.3522 },
        { lat: 48.8738, lon: 2.295 },
      ],
      speed_limit_kmh: 15,
    },
  });
  expect(resp.status()).toBe(422);
});

test("Aucune limite permet d'emprunter le Pont de Normandie (91 km -> ~70 km)", async ({ page }) => {
  await setupNormandyView(page);
  await clickMapAt(page, LE_HAVRE.lat, LE_HAVRE.lon);
  await clickMapAt(page, HONFLEUR.lat, HONFLEUR.lon);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: 15000 });
  await page.waitForTimeout(500);
  const distanceBeforeKm = parseFloat(await page.locator("#route-distance").textContent());
  expect(distanceBeforeKm).toBeGreaterThan(80); // détour par défaut (~91 km)

  await page.locator("#speed-limit-none-checkbox").check();
  await expect(page.locator("#speed-limit-input")).toBeDisabled();
  await page.waitForTimeout(1500);

  const distanceAfterKm = parseFloat(await page.locator("#route-distance").textContent());
  expect(distanceAfterKm).toBeLessThan(80); // le pont redevient utilisable, sans devenir l'itinéraire le plus direct
});

test("le bouton alternatives se désactive avec un seuil personnalisé mais pas avec Aucune limite", async ({
  page,
}) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#show-alternatives-btn")).toBeEnabled();

  await page.fill("#speed-limit-input", "50");
  await page.waitForTimeout(500);
  await expect(page.locator("#show-alternatives-btn")).toBeDisabled();

  await page.fill("#speed-limit-input", "80");
  await page.waitForTimeout(500);
  await expect(page.locator("#show-alternatives-btn")).toBeEnabled();

  await page.locator("#speed-limit-none-checkbox").check();
  await page.waitForTimeout(500);
  await expect(page.locator("#show-alternatives-btn")).toBeEnabled();
});

test("un réglage de vitesse personnalisé survit à la sauvegarde et au rechargement", async ({ page, request }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.fill("#speed-limit-input", "55");
  await page.waitForTimeout(800);

  const name = "Trajet Playwright Speed Limit";
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await expect(page.locator("#saved-routes-list li", { hasText: name })).toBeVisible();

  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === name);
  expect(created.speed_limit_kmh).toBe(55);
  expect(created.no_speed_limit).toBe(false);

  await page.reload();
  await page
    .locator("#saved-routes-list li", { hasText: name })
    .locator("button", { hasText: "✎" })
    .click();
  await expect(page.locator("#speed-limit-input")).toHaveValue("55");

  await request.delete(`/api/routes/${created.id}`);
});
