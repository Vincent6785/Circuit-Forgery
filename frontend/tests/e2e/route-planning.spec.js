import { test, expect } from "@playwright/test";
import { clickMapAt, collectPageErrors } from "./helpers.js";

const ROUTE_NAME = "Trajet Playwright Test";

// Deux points routables à Paris intra-muros, repris du smoke-test-routing.sh backend.
const POINT_A = { lat: 48.8566, lon: 2.3522 };
const POINT_B = { lat: 48.8738, lon: 2.295 };

test("parcours nominal : clic -> calcul -> sauvegarde -> rechargement", async ({ page, request }) => {
  const errors = collectPageErrors(page);

  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  // Zoom sur Paris : au zoom initial (France entière), ces deux points sont
  // trop proches en pixels et le 2e clic tomberait sur le marqueur du 1er,
  // sélectionnant le point au lieu d'en ajouter un nouveau (voir
  // waypoint-editing.spec.js).
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, POINT_A.lat, POINT_A.lon);
  await clickMapAt(page, POINT_B.lat, POINT_B.lon);

  const routeInfo = page.locator("#route-info");
  await expect(routeInfo).not.toHaveClass(/hidden/);
  await expect(page.locator("#route-distance")).toContainText("km");
  await expect(page.locator("#route-error")).toHaveClass(/hidden/);

  await page.fill("#save-route-name-input", ROUTE_NAME);
  await page.locator("#save-route-btn").click();

  const savedItem = page.locator("#saved-routes-list li", { hasText: ROUTE_NAME });
  await expect(savedItem).toBeVisible();

  await page.reload();
  await expect(page.locator("#saved-routes-list li", { hasText: ROUTE_NAME })).toBeVisible();

  // Cliquer le trajet sauvegardé ne doit PAS déclencher un nouvel appel de
  // calcul : le tracé est réaffiché depuis le geometry_geojson mis en cache.
  let computeCalled = false;
  page.on("request", (req) => {
    if (req.url().includes("/api/routes/compute")) computeCalled = true;
  });
  await page.locator("#saved-routes-list li", { hasText: ROUTE_NAME }).click();
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  expect(computeCalled).toBe(false);

  // Nettoyage : supprime le trajet créé, pour ne pas polluer les runs suivants.
  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === ROUTE_NAME);
  if (created) {
    await request.delete(`/api/routes/${created.id}`);
  }

  expect(errors, `Erreurs console/page inattendues : ${errors.join(", ")}`).toEqual([]);
});
