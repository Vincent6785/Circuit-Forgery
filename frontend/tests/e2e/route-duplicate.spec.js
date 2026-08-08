import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);
}

test("dupliquer un trajet sauvegardé crée une nouvelle entrée sans modifier l'original", async ({
  page,
  request,
}) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  const originalName = "Trajet Playwright Original";
  await page.fill("#save-route-name-input", originalName);
  await page.fill("#route-description-input", "Description originale");
  await page.locator("#save-route-btn").click();
  const originalItem = page.locator("#saved-routes-list li", { hasText: originalName });
  await expect(originalItem).toBeVisible();

  await originalItem.locator("button", { hasText: "⎘" }).click();

  // Nom pré-rempli, mais en mode "nouveau trajet", pas en édition.
  await expect(page.locator("#save-route-name-input")).toHaveValue(`Copie de ${originalName}`);
  await expect(page.locator("#route-description-input")).toHaveValue("Description originale");
  await expect(page.locator("#save-route-btn")).toBeVisible();
  await expect(page.locator("#update-route-btn")).toHaveClass(/hidden/);

  // Modifier un point avant de sauvegarder la copie : l'original ne doit pas hériter de ce changement.
  await clickMapAt(page, 48.87, 2.36);
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);

  await page.locator("#save-route-btn").click();
  const copyName = `Copie de ${originalName}`;
  await expect(page.locator("#saved-routes-list li", { hasText: copyName })).toBeVisible();

  const routes = await request.get("/api/routes").then((r) => r.json());
  const original = routes.find((r) => r.name === originalName);
  const copy = routes.find((r) => r.name === copyName);

  expect(original).toBeTruthy();
  expect(copy).toBeTruthy();
  expect(original.id).not.toBe(copy.id);
  expect(original.waypoints).toHaveLength(2);
  expect(copy.waypoints).toHaveLength(3);
  expect(copy.description).toBe("Description originale");

  await request.delete(`/api/routes/${original.id}`);
  await request.delete(`/api/routes/${copy.id}`);
});
