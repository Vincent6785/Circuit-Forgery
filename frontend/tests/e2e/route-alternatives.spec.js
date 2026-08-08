import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

async function setupParisView(page) {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
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

test("bouton alternatives absent pour un trajet à plus de 2 points", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await clickMapAt(page, 48.87, 2.36);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await expect(page.locator("#show-alternatives-btn")).toHaveClass(/hidden/);
});

test("afficher et choisir un itinéraire alternatif pour un trajet à 2 points", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await expect(page.locator("#show-alternatives-btn")).not.toHaveClass(/hidden/);
  await page.locator("#show-alternatives-btn").click();

  const options = page.locator("#alternatives-list li");
  await expect(options.first()).toBeVisible();
  const count = await options.count();
  expect(count).toBeGreaterThanOrEqual(1);
  expect(count).toBeLessThanOrEqual(3);

  const distanceBefore = await page.locator("#route-distance").textContent();

  if (count > 1) {
    await options.nth(1).click();
    await expect(options.nth(1)).toHaveClass(/selected/);
    const distanceAfter = await page.locator("#route-distance").textContent();
    expect(distanceAfter).not.toBe(distanceBefore);
  } else {
    await options.nth(0).click();
    await expect(options.nth(0)).toHaveClass(/selected/);
  }
});

test("le bouton alternatives se désactive avec une zone à éviter active", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#show-alternatives-btn")).toBeEnabled();

  await page.locator("#avoid-zone-toggle-btn").click();
  await dragZone(page, 48.865, 2.325, 48.868, 2.328);
  await page.waitForTimeout(300);

  await expect(page.locator("#show-alternatives-btn")).toBeDisabled();
  await expect(page.locator("#show-alternatives-btn")).toHaveAttribute("title", /GraphHopper/);

  await page.locator("#avoid-zone-list li button", { hasText: "✕" }).click();
  await expect(page.locator("#show-alternatives-btn")).toBeEnabled();
});

test("le bouton alternatives redevient masqué après ajout d'un 3e point", async ({ page }) => {
  await setupParisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#show-alternatives-btn")).not.toHaveClass(/hidden/);

  await clickMapAt(page, 48.87, 2.36);
  await expect(page.locator("#show-alternatives-btn")).toHaveClass(/hidden/);
  await expect(page.locator("#alternatives-list")).toHaveClass(/hidden/);
});
