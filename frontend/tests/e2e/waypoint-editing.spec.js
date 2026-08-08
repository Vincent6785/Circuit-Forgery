import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

// Zoom sur Paris pour espacer suffisamment les points à l'écran (évite qu'un clic
// tombe sur un marqueur existant ou sur les contrôles Leaflet en bas à droite).
async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.86, 2.33], 13, { animate: false }));
  await page.waitForTimeout(300);
}

test("suppression d'un point via le bouton de la liste", async ({ page }) => {
  await setupParisView(page);

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await clickMapAt(page, 48.87, 2.36);

  await expect(page.locator("#waypoint-list li")).toHaveCount(3);

  await page.locator("#waypoint-list li").nth(1).locator("button", { hasText: "✕" }).click();

  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(2);
});

test("réorganisation des points par glisser-déposer dans la liste", async ({ page }) => {
  await setupParisView(page);

  await clickMapAt(page, 48.8566, 2.3522); // A
  await clickMapAt(page, 48.8738, 2.295); // B
  await clickMapAt(page, 48.87, 2.36); // C

  const before = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));

  await page.evaluate(() => {
    const items = document.querySelectorAll("#waypoint-list li");
    const dt = new DataTransfer();
    items[0].dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    items[2].dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
    items[2].dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
  });

  const after = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));
  expect(after).toEqual([before[1], before[2], before[0]]);
});

test("réorganisation des points via les boutons ▲▼ (alternative tactile/clavier au drag)", async ({ page }) => {
  await setupParisView(page);

  await clickMapAt(page, 48.8566, 2.3522); // A
  await clickMapAt(page, 48.8738, 2.295); // B
  await clickMapAt(page, 48.87, 2.36); // C

  const before = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));

  await expect(page.locator("#waypoint-list li").nth(0).locator("button", { hasText: "▲" })).toBeDisabled();
  await expect(page.locator("#waypoint-list li").last().locator("button", { hasText: "▼" })).toBeDisabled();

  await page.locator("#waypoint-list li").nth(0).locator("button", { hasText: "▼" }).click();

  const after = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));
  expect(after).toEqual([before[1], before[0], before[2]]);
});

test("sélection d'un marqueur puis suppression au clavier (touche Suppr)", async ({ page }) => {
  await setupParisView(page);

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  // Suppr sans sélection : ne doit rien faire.
  await page.keyboard.press("Delete");
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  await page.locator(".leaflet-marker-icon").first().click();
  await page.keyboard.press("Delete");

  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});
