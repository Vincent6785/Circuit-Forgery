import { test, expect } from "@playwright/test";

test("point d'intérêt : clic droit -> formulaire -> marqueur + liste -> suppression", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);

  const point = await page.evaluate(() => {
    const p = window.__map.latLngToContainerPoint([48.86, 2.33]);
    return { x: p.x, y: p.y };
  });
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: "right" });

  const popup = page.locator(".poi-form-popup");
  await expect(popup).toBeVisible();

  await popup.locator("input[type=text]").fill("Station essence test");
  await popup.locator("select").selectOption("carburant");
  await popup.locator("button").click();

  await expect(popup).not.toBeVisible();
  const poiItem = page.locator("#poi-list li", { hasText: "Station essence test" });
  await expect(poiItem).toBeVisible();
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  await poiItem.locator("button").click();
  await expect(page.locator("#poi-list li")).toHaveCount(0);
  await expect(page.locator(".leaflet-marker-icon")).toHaveCount(0);

  // Filet de sécurité si l'assertion précédente avait échoué avant que la suppression UI n'ait eu lieu.
  const remaining = await request.get("/api/poi").then((r) => r.json());
  for (const poi of remaining.filter((p) => p.name === "Station essence test")) {
    await request.delete(`/api/poi/${poi.id}`);
  }
});
