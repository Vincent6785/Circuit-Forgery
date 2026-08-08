import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.86, 2.33], 13, { animate: false }));
  await page.waitForTimeout(300);
}

test("clic sur un point de la liste ouvre l'édition inline", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  const firstItem = page.locator("#waypoint-list li").first();
  await firstItem.locator(".waypoint-label").click();
  await expect(firstItem.locator(".waypoint-edit-form")).toBeVisible();
});

test("renommer un waypoint persiste après sauvegarde et rechargement", async ({ page, request }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  const firstItem = page.locator("#waypoint-list li").first();
  await firstItem.locator(".waypoint-label").click();
  const nameInput = firstItem.locator('input[type="text"]');
  await nameInput.fill("Notre-Dame");
  await nameInput.press("Enter");

  await expect(firstItem.locator(".waypoint-label")).toContainText("Notre-Dame");

  const name = "Trajet Playwright Precision";
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await expect(page.locator("#saved-routes-list li", { hasText: name })).toBeVisible();

  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === name);
  expect(created.waypoints[0].label).toBe("Notre-Dame");

  await request.delete(`/api/routes/${created.id}`);
});

test("description de trajet sauvegardée, restaurée au rechargement et en édition", async ({ page, request }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  const name = "Trajet Playwright Description";
  const description = "Belle route sinueuse, prévoir un plein avant.";
  await page.fill("#save-route-name-input", name);
  await page.fill("#route-description-input", description);
  await page.locator("#save-route-btn").click();
  await expect(page.locator("#saved-routes-list li", { hasText: name })).toBeVisible();

  // Le champ se vide après une sauvegarde réussie, tout comme le nom.
  await expect(page.locator("#route-description-input")).toHaveValue("");

  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === name);
  expect(created.description).toBe(description);

  await page.reload();
  await page
    .locator("#saved-routes-list li", { hasText: name })
    .locator("button", { hasText: "✎" })
    .click();
  await expect(page.locator("#route-description-input")).toHaveValue(description);

  await request.delete(`/api/routes/${created.id}`);
});

test("modifier les coordonnées d'un waypoint déplace le point et recalcule", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  const firstItem = page.locator("#waypoint-list li").first();
  await firstItem.locator(".waypoint-label").click();
  const latInput = firstItem.locator('input[type="number"]').first();
  await latInput.fill("48.86");
  await latInput.press("Enter");

  await page.waitForTimeout(800);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints[0].lat).toBeCloseTo(48.86, 3);
});

test("Échap annule l'édition sans modifier le point", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  const before = await page.evaluate(() => window.__getWaypoints());
  const firstItem = page.locator("#waypoint-list li").first();
  await firstItem.locator(".waypoint-label").click();
  const nameInput = firstItem.locator('input[type="text"]');
  await nameInput.fill("Nom temporaire");
  await nameInput.press("Escape");

  await expect(firstItem.locator(".waypoint-edit-form")).not.toBeVisible();
  const after = await page.evaluate(() => window.__getWaypoints());
  expect(after).toEqual(before);
});

test("distance depuis l'étape précédente affichée pour les points suivants uniquement", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.waitForTimeout(500);

  const secondItem = page.locator("#waypoint-list li").nth(1);
  await expect(secondItem.locator(".waypoint-label")).toContainText("km)");

  const firstItem = page.locator("#waypoint-list li").first();
  await expect(firstItem.locator(".waypoint-label")).not.toContainText("km)");
});
