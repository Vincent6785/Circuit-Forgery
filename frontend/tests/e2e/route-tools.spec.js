import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { clickMapAt, mapPointAt, openRouteOptions, openTab, setupParisView } from "./helpers.js";

const A = { lat: 48.8566, lon: 2.3522 };
const B = { lat: 48.8738, lon: 2.295 };

const isCompute = (response) => response.url().includes("/api/routes/compute");

async function placeAB(page) {
  const computed = page.waitForResponse(isCompute);
  await clickMapAt(page, A.lat, A.lon);
  await clickMapAt(page, B.lat, B.lon);
  const route = await (await computed).json();
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.waitForTimeout(500);
  return route;
}

/** Geste tactile simulé en Pointer Events (pointerType "touch") : appui sur
 * `selector`, déplacement puis relâchement, comme un doigt sur écran. */
async function touchDrag(page, selector, from, to) {
  await page.evaluate(
    ([sel, start, end]) => {
      const target = document.querySelector(sel);
      const base = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true, composed: true };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: start.x, clientY: start.y, buttons: 1 }));
      for (let i = 1; i <= 5; i++) {
        const x = start.x + ((end.x - start.x) * i) / 5;
        const y = start.y + ((end.y - start.y) * i) / 5;
        document.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: x, clientY: y, buttons: 1 }));
      }
      document.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: end.x, clientY: end.y }));
    },
    [selector, from, to]
  );
}

test("exporter en GPX le trajet courant, sans l'avoir sauvegardé", async ({ page }) => {
  await setupParisView(page);
  await placeAB(page);
  await page.fill("#save-route-name-input", "Balade : du dimanche");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-gpx-btn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("Balade _ du dimanche.gpx");
  const content = await readFile(await download.path(), "utf-8");
  expect(content).toContain("<rtept");
  expect(content).toContain("Balade : du dimanche");
  expect(content.match(/<trkpt/g).length).toBeGreaterThan(2);
});

test("renommer un trajet sauvegardé depuis le mode modification", async ({ page, request }) => {
  const name = "Trajet Playwright Renommage";
  const renamed = "Trajet Playwright Renommé";
  await setupParisView(page);
  await placeAB(page);
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();

  await openTab(page, "saved");
  await page.locator("#saved-routes-list li", { hasText: name }).locator("button", { hasText: "✎" }).click();
  await expect(page.locator("#update-route-btn")).toBeVisible();

  // Le champ nom reste affiché et prérempli en modification.
  const nameInput = page.locator("#save-route-name-input");
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toHaveValue(name);
  await nameInput.fill(renamed);
  await page.locator("#update-route-btn").click();
  await expect(page.locator("#save-route-btn")).toBeVisible();

  await openTab(page, "saved");
  await expect(page.locator("#saved-routes-list li", { hasText: renamed })).toBeVisible();
  const routes = await request.get("/api/routes?view=summary").then((r) => r.json());
  expect(routes.some((r) => r.name === name)).toBe(false);
  for (const route of routes.filter((r) => r.name === renamed)) {
    await request.delete(`/api/routes/${route.id}`);
  }
});

test("un indicateur signale un calcul en cours", async ({ page }) => {
  await setupParisView(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/routes/compute", async (route) => {
    await gate;
    await route.continue();
  });

  await clickMapAt(page, A.lat, A.lon);
  await clickMapAt(page, B.lat, B.lon);
  const busy = page.locator("#route-busy");
  await expect(busy).toBeVisible();
  await expect(busy).toHaveAttribute("role", "status");

  const computed = page.waitForResponse(isCompute);
  release();
  await computed;
  await expect(busy).toBeHidden();
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await expect(page.locator("#route-info")).toHaveAttribute("aria-busy", "false");
});

test("au doigt, glisser le tracé insère une étape", async ({ page }) => {
  await setupParisView(page);
  const route = await placeAB(page);
  const coords = route.geometry_geojson.coordinates;
  const [lon, lat] = coords[Math.floor(coords.length / 2)];
  const from = await mapPointAt(page, lat, lon);

  const recomputed = page.waitForResponse(isCompute);
  await touchDrag(page, "path.route-hit", from, { x: from.x + 60, y: from.y + 60 });
  await recomputed;

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(3);
  expect(waypoints[0].lat).toBeCloseTo(A.lat, 3);
  expect(waypoints[2].lat).toBeCloseTo(B.lat, 3);
  expect(await page.evaluate(() => window.__map.dragging.enabled())).toBe(true);
});

test("au doigt, glisser sur la carte dessine une zone à éviter", async ({ page }) => {
  await setupParisView(page);
  await openRouteOptions(page);
  await page.locator("#avoid-zone-toggle-btn").click();

  const center = await mapPointAt(page, 48.865, 2.325);
  const edge = await mapPointAt(page, 48.868, 2.328);
  await touchDrag(page, "#map", center, edge);

  const zones = await page.evaluate(() => window.__getAvoidZones());
  expect(zones).toHaveLength(1);
  expect(zones[0].radiusM).toBeGreaterThan(20);
  expect(await page.evaluate(() => window.__map.dragging.enabled())).toBe(true);
});

test("sur mobile, replier le panneau agrandit la carte", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator("#sidebar-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const mapBefore = await page.locator("#map").boundingBox();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".sidebar-scroll")).toBeHidden();
  await expect.poll(async () => (await page.locator("#map").boundingBox()).height).toBeGreaterThan(mapBefore.height + 200);

  // Choisir un onglet réaffiche le panneau.
  await page.locator("#tab-loop").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#round-trip-panel")).toBeVisible();
});

test("sur grand écran, le bouton de repli du panneau n'apparaît pas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#sidebar-toggle")).toBeHidden();
});
