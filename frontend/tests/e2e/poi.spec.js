import { test, expect } from "@playwright/test";
import { openTab } from "./helpers.js";

test("point d'intérêt : clic droit -> formulaire -> marqueur + liste -> suppression", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));
  await page.waitForTimeout(300);
  await openTab(page, "saved");

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

test("nom et notes d'un point d'intérêt sont affichés comme du texte, jamais interprétés", async ({
  page,
  request,
}) => {
  // Régression XSS : le popup du marqueur était construit en concaténant
  // nom et notes dans une chaîne HTML.
  const payload = '<img src=x onerror="window.__poiXss = true">';
  const created = await request
    .post("/api/poi", { data: { name: `Piège ${payload}`, lat: 48.86, lon: 2.33, category: "autre", notes: payload } })
    .then((r) => r.json());

  try {
    await page.goto("/");
    await page.evaluate(() => window.__map.setView([48.86, 2.33], 13, { animate: false }));
    await page.locator(".leaflet-marker-icon").first().click();

    const popup = page.locator(".leaflet-popup-content");
    await expect(popup).toContainText("<img");
    await expect(popup.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__poiXss)).toBeUndefined();
  } finally {
    await request.delete(`/api/poi/${created.id}`);
  }
});
