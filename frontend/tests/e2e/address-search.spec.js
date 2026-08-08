import { test, expect } from "@playwright/test";

// Exception documentée à la règle "pas de mocks" du projet : Nominatim est
// un service tiers public au rate-limit strict, absent de la stack Docker
// locale. Seul GET /api/geocode est simulé ici — tout le reste (ajout du
// point, store, liste sidebar) tourne contre le vrai code de l'app.
const MOCK_RESULTS = [{ label: "Tour Eiffel, Paris, France", lat: 48.8583, lon: 2.2945 }];

test("recherche d'adresse : sélectionner un résultat ajoute un waypoint", async ({ page }) => {
  await page.route("**/api/geocode**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESULTS) })
  );

  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();

  await page.fill("#address-search-input", "Tour Eiffel");
  await expect(page.locator("#address-search-results li")).toHaveCount(1);
  await expect(page.locator("#address-search-results li")).toContainText("Tour Eiffel");

  await page.locator("#address-search-results li").first().click();

  await expect(page.locator("#address-search-results li")).toHaveCount(0);
  await expect(page.locator("#address-search-input")).toHaveValue("");

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(1);
  expect(waypoints[0].lat).toBeCloseTo(48.8583, 3);
  expect(waypoints[0].lon).toBeCloseTo(2.2945, 3);

  await expect(page.locator("#waypoint-list li")).toHaveCount(1);
});

test("recherche d'adresse : moins de 3 caractères ne déclenche pas de requête", async ({ page }) => {
  let called = false;
  await page.route("**/api/geocode**", (route) => {
    called = true;
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await page.fill("#address-search-input", "Pa");
  await page.waitForTimeout(500);

  expect(called).toBe(false);
});
