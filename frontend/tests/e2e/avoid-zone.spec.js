import { test, expect } from "@playwright/test";
import { clickMapAt, dragZone, mapPointAt, openRouteOptions, openTab, setupParisView } from "./helpers.js";

async function setupView(page) {
  await setupParisView(page);
  await openRouteOptions(page);
}

test("dessiner une zone à éviter n'ajoute pas de waypoint parasite", async ({ page }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  const before = await page.evaluate(() => window.__getWaypoints().length);

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);

  const after = await page.evaluate(() => window.__getWaypoints().length);
  expect(after).toBe(before);
});

test("dessiner une zone à éviter change le tracé calculé", async ({ page }) => {
  await setupView(page);

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.waitForTimeout(500);
  const distanceBefore = parseFloat(await page.locator("#route-distance").textContent());

  await page.locator("#avoid-zone-toggle-btn").click();
  await expect(page.locator("#avoid-zone-toggle-btn")).toHaveClass(/active/);

  await dragZone(page, 48.865, 2.325, 48.868, 2.328);

  await expect(page.locator("#avoid-zone-list-panel")).not.toHaveClass(/hidden/);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
  await page.waitForTimeout(800);

  const distanceAfter = parseFloat(await page.locator("#route-distance").textContent());
  expect(distanceAfter).not.toBeCloseTo(distanceBefore, 1);
});

test("retirer une zone recalcule sans elle", async ({ page }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.waitForTimeout(500);
  const distanceBefore = parseFloat(await page.locator("#route-distance").textContent());

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
  await page.waitForTimeout(800);

  await page.locator("#avoid-zone-list li button", { hasText: "✕" }).click();
  await expect(page.locator("#avoid-zone-list-panel")).toHaveClass(/hidden/);
  await page.waitForTimeout(800);

  const distanceAfter = parseFloat(await page.locator("#route-distance").textContent());
  expect(distanceAfter).toBeCloseTo(distanceBefore, 1);
});

test("une zone à éviter survit à la sauvegarde et au rechargement d'un trajet", async ({ page, request }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
  await page.waitForTimeout(800);

  const name = "Trajet Playwright Avoid Zone";
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await openTab(page, "saved");
  await expect(page.locator("#saved-routes-list li", { hasText: name })).toBeVisible();

  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === name);
  expect(created.avoid_zones).toHaveLength(1);

  // Rouvrir ce trajet en édition doit restaurer la zone dans l'UI.
  await page.reload();
  await openTab(page, "saved");
  await page
    .locator("#saved-routes-list li", { hasText: name })
    .locator("button", { hasText: "✎" })
    .click();
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);

  await request.delete(`/api/routes/${created.id}`);
});

test("un clic simple avec un rayon saisi crée une zone de ce rayon exact", async ({ page }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.fill("#avoid-zone-radius-input", "350");
  await page.locator("#avoid-zone-toggle-btn").click();

  // Clic simple, sans glisser : dragZone(center, center) simule un
  // mousedown/mouseup au même point, donc un rayon quasi nul en l'absence
  // du champ rayon.
  await dragZone(page, 48.865, 2.325, 48.865, 2.325);

  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
  const zones = await page.evaluate(() => window.__getAvoidZones());
  expect(zones).toHaveLength(1);
  expect(zones[0].radiusM).toBeCloseTo(350, 0);
});

test("un clic simple sans rayon saisi n'ajoute aucune zone", async ({ page }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.865, 2.325);

  await expect(page.locator("#avoid-zone-list-panel")).toHaveClass(/hidden/);
  const zones = await page.evaluate(() => window.__getAvoidZones());
  expect(zones).toHaveLength(0);
});

test("le filtre anti->80km/h reste actif avec une zone à éviter active", async ({ page, request }) => {
  await setupView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await page.waitForTimeout(800);

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  const resp = await request.post("/api/routes/compute", {
    data: {
      waypoints: waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
      avoid_zones: [{ lat: 48.865, lon: 2.325, radius_m: 400 }],
    },
  });
  const data = await resp.json();
  const speeds = (data.max_speed_by_segment || []).filter((s) => s !== null);
  for (const speed of speeds) {
    expect(speed).toBeLessThanOrEqual(80);
  }
});

/** Envoie un événement pointeur tactile à la position écran donnée : Playwright
 * ne simule pas deux doigts posés en même temps. */
async function dispatchTouch(page, type, pointerId, { x, y }) {
  await page.evaluate(
    ([type, pointerId, x, y]) => {
      const target = document.elementFromPoint(x, y) ?? document;
      const init = { pointerId, pointerType: "touch", isPrimary: pointerId === 11, clientX: x, clientY: y };
      target.dispatchEvent(new PointerEvent(type, { ...init, button: 0, bubbles: true, cancelable: true }));
    },
    [type, pointerId, x, y]
  );
}

/** Nombre de formes dessinées sur la carte (zones et cercle fantôme de dessin). */
const overlayShapeCount = (page) => page.locator("#map .leaflet-overlay-pane path").count();

test("un second doigt posé pendant le dessin ne crée ni seconde zone ni cercle résiduel", async ({ page }) => {
  await setupView(page);
  await page.locator("#avoid-zone-toggle-btn").click();
  // Positions écran calculées d'avance : un geste à deux doigts peut zoomer la carte.
  const first = { down: await mapPointAt(page, 48.865, 2.325), up: await mapPointAt(page, 48.868, 2.328) };
  const second = { down: await mapPointAt(page, 48.86, 2.31), up: await mapPointAt(page, 48.863, 2.313) };

  await dispatchTouch(page, "pointerdown", 11, first.down);
  await dispatchTouch(page, "pointerdown", 12, second.down);
  await dispatchTouch(page, "pointermove", 11, first.up);
  await dispatchTouch(page, "pointermove", 12, second.up);
  await dispatchTouch(page, "pointerup", 11, first.up);
  await dispatchTouch(page, "pointerup", 12, second.up);

  await expect.poll(() => page.evaluate(() => window.__getAvoidZones().length)).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__getAvoidZones().length)).toBe(1);
  expect(await overlayShapeCount(page)).toBe(1);
  expect(await page.evaluate(() => window.__map.dragging.enabled())).toBe(true);
});

test("quitter le mode dessin pendant un tracé l'annule sans ajouter de zone", async ({ page }) => {
  await setupView(page);
  await page.locator("#avoid-zone-toggle-btn").click();
  const down = await mapPointAt(page, 48.865, 2.325);
  const up = await mapPointAt(page, 48.868, 2.328);

  await dispatchTouch(page, "pointerdown", 11, down);
  await dispatchTouch(page, "pointermove", 11, up);
  await openTab(page, "saved");
  await dispatchTouch(page, "pointerup", 11, up);

  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__getAvoidZones())).toHaveLength(0);
  expect(await overlayShapeCount(page)).toBe(0);
  expect(await page.evaluate(() => window.__map.dragging.enabled())).toBe(true);
});

test("relâcher le dessin d'une zone hors de la carte annule sans bloquer la carte", async ({ page }) => {
  // Régression : le relâchement n'était écouté que sur la carte ; hors de la
  // carte, le déplacement restait désactivé et le cercle fantôme affiché.
  await setupView(page);
  await page.locator("#avoid-zone-toggle-btn").click();

  const center = await mapPointAt(page, 48.865, 2.325);
  const sidebar = await page.locator("#sidebar").boundingBox();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(sidebar.x + sidebar.width / 2, sidebar.y + sidebar.height / 2, { steps: 8 });
  await page.mouse.up();

  expect(await page.evaluate(() => window.__getAvoidZones())).toHaveLength(0);
  expect(await page.evaluate(() => window.__map.dragging.enabled())).toBe(true);
});
