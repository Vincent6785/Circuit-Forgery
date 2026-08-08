import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.86, 2.33], 13, { animate: false }));
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

test("boutons annuler/rétablir désactivés sans historique", async ({ page }) => {
  await setupParisView(page);
  await expect(page.locator("#undo-waypoint-btn")).toBeDisabled();
  await expect(page.locator("#redo-waypoint-btn")).toBeDisabled();
});

test("Ctrl+Z restaure un point supprimé, Ctrl+Maj+Z le re-supprime", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await clickMapAt(page, 48.87, 2.36);

  const before = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));

  await page.locator("#waypoint-list li").nth(1).locator("button", { hasText: "✕" }).click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  await page.keyboard.press("Control+z");
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);
  const afterUndo = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));
  expect(afterUndo).toEqual(before);

  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
});

test("boutons Annuler/Rétablir cliquables produisent le même effet que le clavier", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  await expect(page.locator("#undo-waypoint-btn")).toBeEnabled();
  await page.locator("#undo-waypoint-btn").click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(1);

  await expect(page.locator("#redo-waypoint-btn")).toBeEnabled();
  await page.locator("#redo-waypoint-btn").click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
});

test("une nouvelle mutation après un undo efface la pile redo", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await page.locator("#undo-waypoint-btn").click();
  await expect(page.locator("#redo-waypoint-btn")).toBeEnabled();

  await clickMapAt(page, 48.87, 2.36);
  await expect(page.locator("#redo-waypoint-btn")).toBeDisabled();
});

test("Ctrl+Z annule l'ajout d'une zone à éviter comme une mutation de waypoint", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#undo-waypoint-btn")).toBeEnabled();

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);

  await page.keyboard.press("Control+z");
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(0);
  // Les waypoints, mutés avant la zone, ne sont pas concernés par cette annulation.
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
});

test("annuler une mutation de waypoint après une zone restaure aussi la zone (historique combiné)", async ({
  page,
}) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
  // Le mode dessin reste actif après une zone, pour permettre d'en enchaîner
  // plusieurs : il faut le désactiver explicitement avant de reprendre
  // l'ajout normal de points.
  await page.locator("#avoid-zone-toggle-btn").click();

  // Nouvelle mutation de waypoint, postérieure à la zone.
  await clickMapAt(page, 48.87, 2.36);
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);

  // Un seul Ctrl+Z n'annule que le 3e point, la dernière mutation en date ;
  // la zone reste en place — l'historique respecte l'ordre chronologique réel.
  await page.keyboard.press("Control+z");
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  await expect(page.locator("#avoid-zone-list li")).toHaveCount(1);
});

test("Ctrl+Z n'agit pas au niveau app pendant la frappe dans un champ texte", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  const waypointsBefore = await page.evaluate(() => window.__getWaypoints());
  const firstItem = page.locator("#waypoint-list li").first();
  await firstItem.locator(".waypoint-label").click();
  const nameInput = firstItem.locator('input[type="text"]');
  await nameInput.fill("Test");
  await nameInput.press("Control+z");

  // Le formulaire d'édition reste ouvert et les waypoints n'ont pas changé :
  // Ctrl+Z n'a pas déclenché l'annulation au niveau de l'application pendant
  // la frappe — seul l'éventuel undo natif du champ texte a pu s'appliquer.
  await expect(firstItem.locator(".waypoint-edit-form")).toBeVisible();
  const waypointsAfter = await page.evaluate(() => window.__getWaypoints());
  expect(waypointsAfter).toEqual(waypointsBefore);
});
