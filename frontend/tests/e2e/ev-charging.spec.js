import { test, expect } from "@playwright/test";
import { clickMapAt, openRouteOptions, openTab, setupParisView } from "./helpers.js";

// Paris → Orléans : assez long (plus de 100 km) pour que plusieurs recharges
// soient dues avec l'intervalle par défaut de 20 km, et traversé par un parc
// de bornes dense dans la base nationale IRVE.
const START = [48.8566, 2.3522];
const END = [47.9029, 1.9093];

const ROUTE_TIMEOUT = 40_000;

async function enableEv(page, { autonomy, interval } = {}) {
  await openRouteOptions(page);
  await page.locator("#ev-enabled-checkbox").check();
  await expect(page.locator("#ev-settings")).not.toHaveClass(/hidden/);
  if (autonomy !== undefined) await page.fill("#ev-autonomy-input", String(autonomy));
  if (interval !== undefined) await page.fill("#ev-interval-input", String(interval));
  // Quitter le champ valide la saisie sans attendre le débounce, comme le
  // ferait un clic ailleurs dans l'interface.
  await page.locator("#ev-interval-input").blur();
}

/** Pose un trajet long en plaçant départ et arrivée par leurs coordonnées :
 * les deux points sont hors écran à ce niveau de zoom, on passe donc par les
 * champs de l'onglet Itinéraire plutôt que par des clics carte. */
async function drawLongRoute(page) {
  await page.evaluate(([a, b]) => {
    window.__map.setView([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 8, { animate: false });
  }, [START, END]);
  await clickMapAt(page, ...START);
  await clickMapAt(page, ...END);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
}

test("un trajet électrique reçoit des arrêts recharge aux bornes IRVE", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page);
  await drawLongRoute(page);

  const panel = page.locator("#charging-panel");
  await expect(panel).not.toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("#charging-stop-list li").first()).toBeVisible({ timeout: ROUTE_TIMEOUT });

  const stops = await page.evaluate(() => window.__getChargingStops());
  expect(stops.length).toBeGreaterThan(1);

  // Chaque arrêt porte une vraie borne du jeu de données, pas un point
  // quelconque du tracé.
  for (const stop of stops) {
    expect(stop.name.length).toBeGreaterThan(0);
    expect(stop.lat).toBeGreaterThan(46);
    expect(stop.lat).toBeLessThan(50);
  }

  // Les arrêts sont ordonnés le long du trajet.
  const distances = stops.map((s) => s.route_distance_m);
  expect(distances).toEqual([...distances].sort((a, b) => a - b));

  // 20 km sur 100 km d'autonomie = 20 % à regagner, à 1 min 30 le pourcent.
  expect(stops[0].charge_percent).toBeCloseTo(20, 1);
  expect(stops[0].charge_duration_s).toBeCloseTo(1800, 0);
});

test("les arrêts recharge ne deviennent pas des points du trajet", async ({ page }) => {
  // Ce sont des arrêts imposés par le calcul, pas des étapes de
  // l'utilisateur : les ajouter à sa liste rendrait le trajet inéditable
  // (chaque recalcul en rajouterait) et fausserait les distances par étape.
  await setupParisView(page);
  await enableEv(page);
  await drawLongRoute(page);

  await expect(page.locator("#charging-stop-list li").first()).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
});

test("la durée totale ajoute le temps de recharge à la conduite", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page);
  await drawLongRoute(page);

  const total = page.locator("#route-total-with-charging");
  await expect(total).not.toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });
  await expect(total).toContainText("Avec les recharges");
});

test("décocher le mode électrique retire les arrêts", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page);
  await drawLongRoute(page);
  await expect(page.locator("#charging-stop-list li").first()).toBeVisible({ timeout: ROUTE_TIMEOUT });

  await page.locator("#ev-enabled-checkbox").uncheck();
  await expect(page.locator("#charging-panel")).toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("#ev-settings")).toHaveClass(/hidden/);

  await expect
    .poll(() => page.evaluate(() => window.__getChargingStops().length), { timeout: ROUTE_TIMEOUT })
    .toBe(0);
});

test("un circuit en boucle généré reçoit aussi des arrêts recharge", async ({ page }) => {
  // Le mode électrique n'est pas propre à l'onglet Itinéraire : la boucle
  // générée est recalculée par le même /api/routes/compute, donc traitée de
  // la même façon.
  await setupParisView(page);
  await enableEv(page, { interval: 30 });

  await openTab(page, "loop");
  await page.fill("#round-trip-distance-input", "120");
  await page.locator("#round-trip-generate-btn").click();
  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });

  await expect(page.locator("#charging-stop-list li").first()).toBeVisible({ timeout: ROUTE_TIMEOUT });
  const stops = await page.evaluate(() => window.__getChargingStops());
  expect(stops.length).toBeGreaterThan(0);
});

test("un intervalle supérieur à l'autonomie est refusé avant l'envoi", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page, { autonomy: 60, interval: 120 });

  // Message sous les champs, pas de bandeau rouge global : c'est une faute de
  // saisie, pas un échec de calcul.
  await expect(page.locator("#ev-summary")).toHaveClass(/error-hint/);
  await expect(page.locator("#ev-summary")).toContainText("autonomie");
  await expect(page.locator("#route-error")).toHaveClass(/hidden/);
});

test("le résumé des options replié signale le mode électrique", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page, { interval: 35 });
  await expect(page.locator("#route-options-summary")).toContainText("tous les 35 km");
});

test("le mode électrique et ses réglages survivent au rechargement de la page", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page, { autonomy: 150, interval: 45 });
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });
  await page.waitForTimeout(1200); // laisse passer l'autosave du brouillon

  await page.reload();
  await openRouteOptions(page);
  await expect(page.locator("#ev-enabled-checkbox")).toBeChecked();
  await expect(page.locator("#ev-autonomy-input")).toHaveValue("150");
  await expect(page.locator("#ev-interval-input")).toHaveValue("45");
});

test("un trajet sauvegardé retrouve son mode électrique à l'ouverture", async ({ page, request }) => {
  const name = `ev-test-${Date.now()}`;
  await setupParisView(page);
  await enableEv(page, { autonomy: 120, interval: 30 });
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });

  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await expect(page.locator("#saved-routes-list li").filter({ hasText: name })).toHaveCount(1, {
    timeout: ROUTE_TIMEOUT,
  });

  // Repasse en thermique, puis rouvre le trajet : il doit ramener son réglage.
  await page.locator("#ev-enabled-checkbox").uncheck();
  await openTab(page, "saved");
  await page.locator("#saved-routes-list li").filter({ hasText: name }).locator("button").first().click();

  await openRouteOptions(page);
  await expect(page.locator("#ev-enabled-checkbox")).toBeChecked({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator("#ev-autonomy-input")).toHaveValue("120");
  await expect(page.locator("#ev-interval-input")).toHaveValue("30");

  const routes = await (await request.get("/api/routes?view=summary")).json();
  for (const route of routes.filter((r) => r.name === name)) {
    await request.delete(`/api/routes/${route.id}`);
  }
});
