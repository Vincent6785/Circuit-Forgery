import { test, expect } from "@playwright/test";
import { clickMapAt, collectPageErrors } from "./helpers.js";

const ROUTE_NAME = "Trajet Playwright Edit Test";

const POINT_A = { lat: 48.8566, lon: 2.3522 };
const POINT_B = { lat: 48.8738, lon: 2.295 };
const POINT_C = { lat: 48.87, lon: 2.36 };

test("édition d'un trajet sauvegardé : Modifier -> mutation -> enregistrement -> persistance", async ({
  page,
  request,
}) => {
  const errors = collectPageErrors(page);

  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, POINT_A.lat, POINT_A.lon);
  await clickMapAt(page, POINT_B.lat, POINT_B.lon);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.fill("#save-route-name-input", ROUTE_NAME);
  await page.locator("#save-route-btn").click();
  const savedItem = page.locator("#saved-routes-list li", { hasText: ROUTE_NAME });
  await expect(savedItem).toBeVisible();

  // Entrer en mode édition via le bouton "✎".
  await savedItem.locator("button", { hasText: "✎" }).click();

  await expect(page.locator("#save-route-btn")).toHaveClass(/hidden/);
  await expect(page.locator("#update-route-btn")).not.toHaveClass(/hidden/);
  await expect(page.locator("#cancel-edit-btn")).not.toHaveClass(/hidden/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  // Mutation du tracé : ajout d'un 3e point.
  await clickMapAt(page, POINT_C.lat, POINT_C.lon);
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.locator("#update-route-btn").click();

  // Le mode édition se referme après enregistrement.
  await expect(page.locator("#save-route-btn")).not.toHaveClass(/hidden/);
  await expect(page.locator("#update-route-btn")).toHaveClass(/hidden/);

  // Vérification côté backend : le trajet persisté a bien 3 waypoints désormais.
  const routes = await request.get("/api/routes").then((r) => r.json());
  const updated = routes.find((r) => r.name === ROUTE_NAME);
  expect(updated).toBeTruthy();
  expect(updated.waypoints).toHaveLength(3);

  // Persistance après rechargement : rouvrir en édition doit refléter les 3 points.
  await page.reload();
  await page
    .locator("#saved-routes-list li", { hasText: ROUTE_NAME })
    .locator("button", { hasText: "✎" })
    .click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);

  await request.delete(`/api/routes/${updated.id}`);

  expect(errors, `Erreurs console/page inattendues : ${errors.join(", ")}`).toEqual([]);
});

test("annulation d'une édition ne modifie pas le trajet sauvegardé", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, POINT_A.lat, POINT_A.lon);
  await clickMapAt(page, POINT_B.lat, POINT_B.lon);

  const name = ROUTE_NAME + " Cancel";
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  const savedItem = page.locator("#saved-routes-list li", { hasText: name });
  await expect(savedItem).toBeVisible();

  await savedItem.locator("button", { hasText: "✎" }).click();
  await clickMapAt(page, POINT_C.lat, POINT_C.lon);
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);

  await page.locator("#cancel-edit-btn").click();
  await expect(page.locator("#save-route-btn")).not.toHaveClass(/hidden/);

  const routes = await request.get("/api/routes").then((r) => r.json());
  const stillOriginal = routes.find((r) => r.name === name);
  expect(stillOriginal.waypoints).toHaveLength(2);

  await request.delete(`/api/routes/${stillOriginal.id}`);
});
