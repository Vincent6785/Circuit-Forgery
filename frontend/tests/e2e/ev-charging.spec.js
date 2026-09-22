import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";
import { clickMapAt, openRouteOptions, openTab, setupParisView } from "./helpers.js";

// Sud-est de Paris → Loiret : plus de 100 km, donc plusieurs recharges dues
// avec l'intervalle par défaut de 20 km, dans une zone bien pourvue en bornes.
//
// Volontairement à l'écart de Paris intra-muros : les points d'intérêt vivent
// dans la base partagée par toute la suite, et poi.spec.js en crée un à
// 48.86, 2.33 — à quelques pixels du centre de Paris au zoom 8. Le marqueur
// interceptait le clic destiné à la carte, et le trajet restait vide, mais
// seulement quand les deux fichiers tournaient de front.
const START = [48.6, 2.6];
const END = [47.85, 1.95];

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

/** Pose un trajet assez long pour demander plusieurs recharges : on dézoome
 * jusqu'à voir Paris et Orléans ensemble, puis on clique les deux points.
 *
 * Chaque clic est confirmé avant le suivant. Sans cette attente, un clic
 * posé pendant que Leaflet repositionne encore ses couches après le
 * changement de vue était parfois perdu, et le trajet ne comptait qu'un
 * point — observé uniquement quand plusieurs fichiers de tests tournent de
 * front, donc sous charge. */
async function drawLongRoute(page) {
  await page.evaluate(([a, b]) => {
    window.__map.setView([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 8, { animate: false });
  }, [START, END]);
  await page.waitForTimeout(300);
  await clickMapAt(page, ...START);
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
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

test("l'export GPX du trajet courant contient les arrêts recharge", async ({ page }) => {
  await setupParisView(page);
  await enableEv(page);
  await drawLongRoute(page);
  await expect(page.locator("#charging-stop-list li").first()).toBeVisible({ timeout: ROUTE_TIMEOUT });

  const stops = await page.evaluate(() => window.__getChargingStops());
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-gpx-btn").click(),
  ]).then(([d]) => d);
  const gpx = readFileSync(await download.path(), "utf8");

  // Une balise <wpt> par arrêt, nommée dans l'ordre de passage.
  expect(gpx.match(/<wpt /g) ?? []).toHaveLength(stops.length);
  expect(gpx).toContain(`<name>1. ${stops[0].name}</name>`);
  expect(gpx).toContain("<type>charging-station</type>");

  // Le schéma GPX 1.1 impose metadata, wpt*, rte*, trk* : un lecteur strict
  // refuserait un fichier où les repères suivent l'itinéraire.
  expect(gpx.indexOf("<wpt ")).toBeLessThan(gpx.indexOf("<rte>"));
  // Les arrêts ne sont pas des points du trajet : le <rte> n'en contient que
  // le départ et l'arrivée.
  const route = gpx.slice(gpx.indexOf("<rte>"), gpx.indexOf("</rte>"));
  expect(route.match(/<rtept /g) ?? []).toHaveLength(2);
});

test("un trajet thermique s'exporte sans repère de recharge", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/, { timeout: ROUTE_TIMEOUT });

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-gpx-btn").click(),
  ]).then(([d]) => d);
  expect(readFileSync(await download.path(), "utf8")).not.toContain("<wpt ");
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
