import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

const VALID_POINT = { lat: 48.8566, lon: 2.3522 }; // Paris
// Coordonnées exactes en mer près du Cotentin qui ont réellement déclenché ce
// bug en usage réel (PointNotFoundException côté GraphHopper, voir README).
// Attention : un point "en mer" choisi au hasard peut en fait se faire
// snapper sur une ligne de ferry indexée par GraphHopper — constaté avec un
// premier point dans le golfe de Gascogne, qui avait renvoyé un itinéraire
// de plus de 1000 km au lieu d'échouer. Ce point précis a été vérifié via
// curl comme déclenchant bien un 422.
const UNROUTABLE_POINT = { lat: 49.653404588437894, lon: -3.7023925781250004 };

test("point sans route à proximité : message inline, pas de popup navigateur", async ({ page }) => {
  let dialogFired = false;
  page.on("dialog", async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  let computeStatus = null;
  page.on("response", (res) => {
    if (res.url().includes("/api/routes/compute")) computeStatus = res.status();
  });

  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();

  await clickMapAt(page, VALID_POINT.lat, VALID_POINT.lon);
  await clickMapAt(page, UNROUTABLE_POINT.lat, UNROUTABLE_POINT.lon);

  const errorBanner = page.locator("#route-error");
  await expect(errorBanner).not.toHaveClass(/hidden/);
  await expect(errorBanner).not.toBeEmpty();
  expect(computeStatus).toBe(422);
  expect(dialogFired).toBe(false);

  // L'app doit rester utilisable : après avoir effacé les points, un nouveau
  // calcul valide doit fonctionner et faire disparaître le message d'erreur.
  await page.locator("#clear-route-btn").click();
  // Zoom sur Paris pour espacer ces deux points en pixels (voir route-planning.spec.js).
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await expect(errorBanner).toHaveClass(/hidden/);
});
