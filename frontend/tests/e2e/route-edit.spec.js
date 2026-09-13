import { test, expect } from "@playwright/test";
import { clickMapAt, collectPageErrors, confirmDelete, openTab } from "./helpers.js";

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
  await openTab(page, "saved");
  const savedItem = page.locator("#saved-routes-list li", { hasText: ROUTE_NAME });
  await expect(savedItem).toBeVisible();

  // Entre en mode édition via le bouton "✎".
  await savedItem.locator("button", { hasText: "✎" }).click();

  await expect(page.locator("#save-route-btn")).toHaveClass(/hidden/);
  await expect(page.locator("#update-route-btn")).not.toHaveClass(/hidden/);
  await expect(page.locator("#cancel-edit-btn")).not.toHaveClass(/hidden/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  // Mutation du tracé : ajoute un 3e point.
  await clickMapAt(page, POINT_C.lat, POINT_C.lon);
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.locator("#update-route-btn").click();

  // Le mode édition se referme une fois l'enregistrement effectué.
  await expect(page.locator("#save-route-btn")).not.toHaveClass(/hidden/);
  await expect(page.locator("#update-route-btn")).toHaveClass(/hidden/);

  // Vérifie côté backend que le trajet persisté a bien 3 waypoints désormais.
  const routes = await request.get("/api/routes").then((r) => r.json());
  const updated = routes.find((r) => r.name === ROUTE_NAME);
  expect(updated).toBeTruthy();
  expect(updated.waypoints).toHaveLength(3);

  // Persistance après rechargement : rouvrir en édition doit bien montrer les 3 points.
  await page.reload();
  await openTab(page, "saved");
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
  await openTab(page, "saved");
  const savedItem = page.locator("#saved-routes-list li", { hasText: name });
  await expect(savedItem).toBeVisible();

  await savedItem.locator("button", { hasText: "✎" }).click();
  // L'ouverture charge le détail du trajet de façon asynchrone : attendre
  // qu'il soit affiché, sinon le point cliqué serait remplacé au chargement.
  await expect(page.locator("#update-route-btn")).toBeVisible();
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  await clickMapAt(page, POINT_C.lat, POINT_C.lon);
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);

  await page.locator("#cancel-edit-btn").click();
  await expect(page.locator("#save-route-btn")).not.toHaveClass(/hidden/);

  const routes = await request.get("/api/routes").then((r) => r.json());
  const stillOriginal = routes.find((r) => r.name === name);
  expect(stillOriginal.waypoints).toHaveLength(2);

  await request.delete(`/api/routes/${stillOriginal.id}`);
});

test("supprimer le trajet en cours de modification quitte le mode modification", async ({ page, request }) => {
  const name = ROUTE_NAME + " Suppression";
  await page.goto("/");
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await clickMapAt(page, POINT_A.lat, POINT_A.lon);
  await clickMapAt(page, POINT_B.lat, POINT_B.lon);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();

  await openTab(page, "saved");
  const savedItem = page.locator("#saved-routes-list li", { hasText: name });
  await savedItem.locator("button", { hasText: "✎" }).click();
  await expect(page.locator("#update-route-btn")).toBeVisible();

  await openTab(page, "saved");
  await confirmDelete(savedItem.locator('button[data-action="delete"]'));
  await expect(savedItem).toHaveCount(0);

  await expect(page.locator("#update-route-btn")).toBeHidden();
  await expect(page.locator("#save-route-btn")).toBeVisible();
  await expect(page.locator("#route-error")).toHaveClass(/info/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);

  const routes = await request.get("/api/routes").then((r) => r.json());
  for (const route of routes.filter((r) => r.name === name)) {
    await request.delete(`/api/routes/${route.id}`);
  }
});

test("ouvrir un trajet sauvegardé pendant un calcul garde le tracé du trajet ouvert", async ({ page, request }) => {
  const name = ROUTE_NAME + " Calcul en cours";
  await page.goto("/");
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await clickMapAt(page, POINT_A.lat, POINT_A.lon);
  await clickMapAt(page, POINT_B.lat, POINT_B.lon);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  const summaryRequest = page.waitForRequest((r) => r.url().includes("/api/routes?view=summary"));
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await summaryRequest;
  const saved = (await request.get("/api/routes").then((r) => r.json())).find((r) => r.name === name);

  // Le calcul déclenché par un 3e point est ralenti : il est encore en cours
  // quand le trajet sauvegardé (2 points) est ouvert.
  let delayNext = true;
  await page.route("**/api/routes/compute", async (route) => {
    if (delayNext) {
      delayNext = false;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    // La requête a pu être annulée côté page entre-temps.
    await route.continue().catch(() => {});
  });
  const slowCompute = page.waitForRequest((r) => r.url().includes("/api/routes/compute"));
  await clickMapAt(page, POINT_C.lat, POINT_C.lon);
  await slowCompute;

  await openTab(page, "saved");
  await page.locator("#saved-routes-list li", { hasText: name }).locator("button", { hasText: "✎" }).click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  // Au-delà de la réponse ralentie : elle ne doit plus remplacer le tracé.
  await page.waitForTimeout(2500);

  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  const computed = await page.evaluate(() => window.__getComputedRoute());
  expect(Math.abs(computed.distance_m - saved.distance_m) / saved.distance_m).toBeLessThan(0.01);

  await page.unroute("**/api/routes/compute");
  await request.delete(`/api/routes/${saved.id}`);
});

test("rouvrir un trajet sauvegardé affiche son tracé même si le recalcul échoue", async ({ page, request }) => {
  const name = ROUTE_NAME + " Hors ligne";
  await page.goto("/");
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await clickMapAt(page, POINT_A.lat, POINT_A.lon);
  await clickMapAt(page, POINT_B.lat, POINT_B.lon);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  // La liste affichée est la version allégée (sans géométrie).
  const summaryRequest = page.waitForRequest((r) => r.url().includes("/api/routes?view=summary"));
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await summaryRequest;
  const saved = (await request.get("/api/routes").then((r) => r.json())).find((r) => r.name === name);

  await page.route("**/api/routes/compute", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Le moteur de routage est indisponible pour le moment." }),
    })
  );
  await openTab(page, "saved");
  const computeFailed = page.waitForResponse((r) => r.url().includes("/api/routes/compute"));
  await page.locator("#saved-routes-list li", { hasText: name }).locator(".list-item-label").click();
  await computeFailed;
  await page.waitForTimeout(300);

  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await expect(page.locator("#route-distance")).toHaveText(`${(saved.distance_m / 1000).toFixed(1)} km`);
  await expect(page.locator("#route-error")).toHaveClass(/hidden/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  // Un trajet rouvert n'est pas une modification : aucun brouillon n'est écrit.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => localStorage.getItem("circuit-forgery:draft:v1"))).toBeNull();

  await request.delete(`/api/routes/${saved.id}`);
});
