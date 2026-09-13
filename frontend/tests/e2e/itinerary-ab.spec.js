import { test, expect } from "@playwright/test";
import { clickMapAt, collectPageErrors, mapPointAt, openRouteOptions, openTab } from "./helpers.js";

// Points routables à Paris intra-muros, repris des autres suites.
const A = { lat: 48.8566, lon: 2.3522 };
const B = { lat: 48.8738, lon: 2.295 };
const C = { lat: 48.87, lon: 2.36 };

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);
}

const isCompute = (response) => response.url().includes("/api/routes/compute");
const getWaypoints = (page) => page.evaluate(() => window.__getWaypoints());

/** Pose A puis B et attend le tracé (dont fitBounds, qui déplace la vue). */
async function placeAB(page) {
  const computed = page.waitForResponse(isCompute);
  await clickMapAt(page, A.lat, A.lon);
  await clickMapAt(page, B.lat, B.lon);
  const route = await (await computed).json();
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.waitForTimeout(500);
  return route;
}

test("marqueurs et liste affichent A, les étapes numérotées, puis B", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, A.lat, A.lon);
  await expect(page.locator(".wp-pin")).toHaveText(["A"]);

  await clickMapAt(page, B.lat, B.lon);
  await expect(page.locator(".wp-pin")).toHaveText(["A", "B"]);

  await clickMapAt(page, C.lat, C.lon);
  await expect(page.locator(".wp-pin")).toHaveText(["A", "1", "B"]);
  await expect(page.locator("#waypoint-list .waypoint-dot")).toHaveText(["A", "1", "B"]);
});

test("un clic après l'arrivée insère une étape, l'arrivée reste le dernier point", async ({ page }) => {
  await setupParisView(page);
  await placeAB(page);

  await clickMapAt(page, C.lat, C.lon);

  const waypoints = await getWaypoints(page);
  expect(waypoints).toHaveLength(3);
  expect(waypoints[1].lat).toBeCloseTo(C.lat, 3);
  expect(waypoints[1].lon).toBeCloseTo(C.lon, 3);
  expect(waypoints[2].lat).toBeCloseTo(B.lat, 3);
  expect(waypoints[2].lon).toBeCloseTo(B.lon, 3);
});

test("Maj + clic prolonge le trajet : le point devient la nouvelle arrivée", async ({ page }) => {
  await setupParisView(page);
  await placeAB(page);

  await page.keyboard.down("Shift");
  await clickMapAt(page, C.lat, C.lon);
  await page.keyboard.up("Shift");

  const waypoints = await getWaypoints(page);
  expect(waypoints).toHaveLength(3);
  expect(waypoints[1].lat).toBeCloseTo(B.lat, 3);
  expect(waypoints[2].lat).toBeCloseTo(C.lat, 3);
  expect(waypoints[2].lon).toBeCloseTo(C.lon, 3);
});

test("glisser un marqueur le déplace et recalcule le trajet", async ({ page }) => {
  const errors = collectPageErrors(page);
  await setupParisView(page);
  await placeAB(page);
  const distanceBefore = await page.locator("#route-distance").textContent();

  const pin = await page.locator(".wp-pin", { hasText: "B" }).boundingBox();
  const target = { lat: 48.868, lon: 2.32 };
  const to = await mapPointAt(page, target.lat, target.lon);

  const recomputed = page.waitForResponse(isCompute);
  await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await recomputed;

  const waypoints = await getWaypoints(page);
  expect(waypoints).toHaveLength(2);
  expect(waypoints[1].lat).toBeCloseTo(target.lat, 2);
  expect(waypoints[1].lon).toBeCloseTo(target.lon, 2);
  await expect(page.locator("#route-distance")).not.toHaveText(distanceBefore);
  expect(errors, `Erreurs console/page inattendues : ${errors.join(", ")}`).toEqual([]);
});

test("glisser le tracé insère une seule étape entre les deux points concernés", async ({ page }) => {
  const errors = collectPageErrors(page);
  await setupParisView(page);
  const route = await placeAB(page);

  const coords = route.geometry_geojson.coordinates;
  const [lon, lat] = coords[Math.floor(coords.length / 2)];
  const from = await mapPointAt(page, lat, lon);

  await page.mouse.move(from.x, from.y);
  await expect(page.locator(".leaflet-tooltip", { hasText: "ajouter une étape" })).toBeVisible();

  const recomputed = page.waitForResponse(isCompute);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 60, { steps: 8 });
  await page.mouse.up();
  await recomputed;
  await page.waitForTimeout(300);

  // Une seule étape : le click émis par le navigateur au relâchement ne doit
  // pas en ajouter une seconde.
  const waypoints = await getWaypoints(page);
  expect(waypoints).toHaveLength(3);
  expect(waypoints[0].lat).toBeCloseTo(A.lat, 3);
  expect(waypoints[2].lat).toBeCloseTo(B.lat, 3);
  expect(errors, `Erreurs console/page inattendues : ${errors.join(", ")}`).toEqual([]);
});

test("clic droit sur un marqueur le supprime sans ouvrir le formulaire de point d'intérêt", async ({ page }) => {
  await setupParisView(page);
  await placeAB(page);

  await page.locator(".wp-pin", { hasText: "B" }).click({ button: "right" });

  await expect.poll(async () => (await getWaypoints(page)).length).toBe(1);
  await expect(page.locator(".poi-form-popup")).toHaveCount(0);
  await expect(page.locator(".wp-pin")).toHaveText(["A"]);
});

test("le résumé du trajet n'affiche que les actions pertinentes", async ({ page }) => {
  // Régression : ".panel button { display: block }" l'emportait sur
  // ".hidden", laissant visibles des boutons masqués. Les autres suites ne
  // vérifient que la classe, d'où ce contrôle de visibilité réelle.
  await setupParisView(page);
  await placeAB(page);

  await expect(page.locator("#save-route-btn")).toBeVisible();
  await expect(page.locator("#save-route-name-input")).toBeVisible();
  await expect(page.locator("#update-route-btn")).toBeHidden();
  await expect(page.locator("#cancel-edit-btn")).toBeHidden();
  await expect(page.locator("#show-alternatives-btn")).toBeVisible();

  await clickMapAt(page, C.lat, C.lon);
  await expect(page.locator("#show-alternatives-btn")).toBeHidden();
});

test("sur mobile, le résumé du trajet laisse de la place au contenu des onglets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupParisView(page);
  await placeAB(page);

  const sidebar = await page.locator("#sidebar").boundingBox();
  const scroll = await page.locator(".sidebar-scroll").boundingBox();
  const footer = await page.locator(".sidebar-footer").boundingBox();
  // Le pied est plafonné à 45 % de la sidebar (style.css), le reste revient aux onglets.
  expect(footer.height).toBeLessThanOrEqual(sidebar.height * 0.45 + 1);
  expect(scroll.height).toBeGreaterThan(100);
  await expect(page.locator("#itinerary-start-input")).toBeInViewport();
});

test("les sections de la sidebar suivent l'onglet actif, mémorisé au rechargement", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#tab-route")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#itinerary-panel")).toBeVisible();
  await expect(page.locator("#round-trip-panel")).toBeHidden();
  await expect(page.locator("#route-options")).toBeVisible();

  await openTab(page, "loop");
  await expect(page.locator("#round-trip-panel")).toBeVisible();
  await expect(page.locator("#itinerary-panel")).toBeHidden();
  await expect(page.locator("#route-options")).toBeVisible();

  await openTab(page, "saved");
  await expect(page.locator("#tabpanel-saved")).toBeVisible();
  await expect(page.locator("#route-options")).toBeHidden();

  await page.reload();
  await expect(page.locator("#tab-saved")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#tabpanel-saved")).toBeVisible();

  // Navigation clavier du motif ARIA "tabs" : les flèches bouclent.
  await page.locator("#tab-saved").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-route")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#tab-route")).toBeFocused();
  await expect(page.locator("#tab-saved")).toHaveAttribute("tabindex", "-1");
});

test("replier les options désactive le mode dessin de zone", async ({ page }) => {
  await setupParisView(page);
  await openRouteOptions(page);
  const toggle = page.locator("#avoid-zone-toggle-btn");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.locator("#route-options summary").click();
  await openRouteOptions(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // Le clic carte ajoute de nouveau un point au lieu de dessiner une zone.
  await clickMapAt(page, A.lat, A.lon);
  expect(await getWaypoints(page)).toHaveLength(1);
});

test("le résumé des options reste visible panneau replié", async ({ page }) => {
  await setupParisView(page);
  const summary = page.locator("#route-options-summary");
  await expect(summary).toHaveText("≤ 80 km/h");

  await openRouteOptions(page);
  await page.locator("#speed-limit-none-checkbox").check();
  await expect(summary).toHaveText("Sans limite");
});
