import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

const DRAFT_KEY = "circuit-forgery:draft:v1";

test("un trajet non sauvegardé est restauré après rechargement de la page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate((key) => localStorage.removeItem(key), DRAFT_KEY);
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  // Laisse le temps au debounce de l'autosave (800ms) d'écrire le brouillon.
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY))
    .not.toBeNull();

  await page.reload();

  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(2);
});

test("effacer les points supprime aussi le brouillon", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY))
    .not.toBeNull();

  await page.locator("#clear-route-btn").click();

  const draft = await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY);
  expect(draft).toBeNull();
});
