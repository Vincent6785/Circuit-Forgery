import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);
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

test("dessiner une zone à éviter n'ajoute pas de waypoint parasite", async ({ page }) => {
  await setupParisView(page);
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
  await setupParisView(page);

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
  await setupParisView(page);
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
  await setupParisView(page);
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
  await expect(page.locator("#saved-routes-list li", { hasText: name })).toBeVisible();

  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === name);
  expect(created.avoid_zones).toHaveLength(1);

  // Rouvrir ce trajet en édition doit restaurer la zone dans l'UI.
  await page.reload();
  await page
    .locator("#saved-routes-list li", { hasText: name })
    .locator("button", { hasText: "✎" })
    .click();
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);

  await request.delete(`/api/routes/${created.id}`);
});

test("un clic simple avec un rayon saisi crée une zone de ce rayon exact", async ({ page }) => {
  await setupParisView(page);
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
  await setupParisView(page);
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
  await setupParisView(page);
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
