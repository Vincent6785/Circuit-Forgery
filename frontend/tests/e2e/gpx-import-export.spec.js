import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { clickMapAt, collectPageErrors } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.gpx");

const ROUTE_NAME = "Trajet Playwright GPX Export";

test("import GPX : les points du fichier sont chargés et recalculés", async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await page.locator("#gpx-import-input").setInputFiles(FIXTURE_PATH);

  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await expect(page.locator("#route-error")).toHaveClass(/hidden/);

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(2);
  expect(waypoints[0].lat).toBeCloseTo(48.8566, 3);
  expect(waypoints[0].lon).toBeCloseTo(2.3522, 3);

  expect(errors, `Erreurs console/page inattendues : ${errors.join(", ")}`).toEqual([]);
});

test("export GPX : le fichier téléchargé contient les waypoints du trajet sauvegardé", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await page.fill("#save-route-name-input", ROUTE_NAME);
  await page.locator("#save-route-btn").click();
  const savedItem = page.locator("#saved-routes-list li", { hasText: ROUTE_NAME });
  await expect(savedItem).toBeVisible();

  const routes = await request.get("/api/routes").then((r) => r.json());
  const created = routes.find((r) => r.name === ROUTE_NAME);
  expect(created).toBeTruthy();

  const gpxResponse = await request.get(`/api/routes/${created.id}/export.gpx`);
  expect(gpxResponse.ok()).toBe(true);
  expect(gpxResponse.headers()["content-type"]).toContain("gpx+xml");
  const gpxText = await gpxResponse.text();
  expect(gpxText).toContain("<rtept");
  expect(gpxText).toContain(`lat="${created.waypoints[0].lat.toFixed(6)}"`);
  expect(gpxText).toContain(`lat="${created.waypoints[1].lat.toFixed(6)}"`);

  await request.delete(`/api/routes/${created.id}`);
});

test("import GPX invalide : message d'erreur inline, pas de popup navigateur", async ({ page }) => {
  let dialogFired = false;
  page.on("dialog", async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();

  const buffer = Buffer.from("ceci n'est pas un GPX valide");
  await page.locator("#gpx-import-input").setInputFiles({
    name: "invalid.gpx",
    mimeType: "application/gpx+xml",
    buffer,
  });

  const routeError = page.locator("#route-error");
  await expect(routeError).not.toHaveClass(/hidden/);
  await expect(page.locator("#waypoint-list li")).toHaveCount(0);
  expect(dialogFired).toBe(false);
});
