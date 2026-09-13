import { test, expect } from "@playwright/test";
import { clickMapAt } from "./helpers.js";

// Exception documentée à la règle "pas de mocks" du projet : Nominatim est
// un service tiers public au rate-limit strict, absent de la stack Docker
// locale. Seul GET /api/geocode est simulé ici — tout le reste (points,
// store, calcul d'itinéraire, liste sidebar) tourne contre le vrai code de
// l'app.
const PLACES = {
  eiffel: { label: "Tour Eiffel, Paris, France", lat: 48.8583, lon: 2.2945 },
  louvre: { label: "Musée du Louvre, Paris, France", lat: 48.8606, lon: 2.3376 },
  bastille: { label: "Place de la Bastille, Paris, France", lat: 48.8532, lon: 2.3691 },
};

async function mockGeocode(page, resultsFor) {
  await page.route("**/api/geocode**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resultsFor(q)) });
  });
}

function byKeyword(q) {
  return Object.entries(PLACES)
    .filter(([key]) => q.toLowerCase().includes(key))
    .map(([, place]) => place);
}

async function pickAddress(page, field, query) {
  await page.locator(`#itinerary-${field}-input`).fill(query);
  const option = page.locator(`#itinerary-${field}-results [role="option"]`).first();
  await expect(option).toBeVisible();
  await option.click();
}

const labels = (page) => page.evaluate(() => window.__getWaypoints().map((w) => w.label));

test("départ puis arrivée par adresse : crée A puis B et calcule le trajet", async ({ page }) => {
  await mockGeocode(page, byKeyword);
  await page.goto("/");

  await expect(page.locator("#itinerary-end-input")).toBeDisabled();
  await expect(page.locator("#itinerary-step-input")).toBeDisabled();

  await pickAddress(page, "start", "eiffel");
  await expect(page.locator('#itinerary-start-results [role="option"]')).toHaveCount(0);
  await expect(page.locator("#itinerary-start-input")).toHaveValue(PLACES.eiffel.label);
  await expect(page.locator("#itinerary-end-input")).toBeEnabled();
  await expect(page.locator("#itinerary-step-input")).toBeDisabled();

  await pickAddress(page, "end", "louvre");
  await expect(page.locator("#itinerary-end-input")).toHaveValue(PLACES.louvre.label);
  await expect(page.locator("#itinerary-step-input")).toBeEnabled();
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints.map((w) => w.label)).toEqual([PLACES.eiffel.label, PLACES.louvre.label]);
  expect(waypoints[0].lat).toBeCloseTo(PLACES.eiffel.lat, 4);
  expect(waypoints[1].lon).toBeCloseTo(PLACES.louvre.lon, 4);
});

test("changer le départ remplace le point au lieu d'en ajouter un", async ({ page }) => {
  await mockGeocode(page, byKeyword);
  await page.goto("/");
  await pickAddress(page, "start", "eiffel");
  await pickAddress(page, "end", "louvre");
  const idsBefore = await page.evaluate(() => window.__getWaypoints().map((w) => w.id));

  await pickAddress(page, "start", "bastille");

  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints.map((w) => w.id)).toEqual(idsBefore);
  expect(waypoints.map((w) => w.label)).toEqual([PLACES.bastille.label, PLACES.louvre.label]);
  await expect(page.locator("#itinerary-start-input")).toHaveValue(PLACES.bastille.label);

  // Une seule mutation annulable : Ctrl+Z restaure l'ancien départ.
  await page.locator("h1").click();
  await page.keyboard.press("Control+z");
  expect(await labels(page)).toEqual([PLACES.eiffel.label, PLACES.louvre.label]);
});

test("une étape par adresse s'insère entre le départ et l'arrivée", async ({ page }) => {
  await mockGeocode(page, byKeyword);
  await page.goto("/");
  await pickAddress(page, "start", "eiffel");
  await pickAddress(page, "end", "bastille");

  await pickAddress(page, "step", "louvre");

  expect(await labels(page)).toEqual([PLACES.eiffel.label, PLACES.louvre.label, PLACES.bastille.label]);
  await expect(page.locator("#itinerary-step-input")).toHaveValue("");
  await expect(page.locator("#itinerary-end-input")).toHaveValue(PLACES.bastille.label);
});

test("les champs reflètent un trajet posé au clic sur la carte", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, 48.8566, 2.3522);
  await expect(page.locator("#itinerary-start-input")).toHaveValue(/^48\.8\d{4}, 2\.3\d{4}$/);
  await expect(page.locator("#itinerary-end-input")).toHaveValue("");

  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#itinerary-end-input")).toHaveValue(/^48\.8\d{4}, 2\.29\d{3}$/);
});

test("clavier : ↓ et Entrée choisissent une suggestion, Échap ferme puis rétablit le champ", async ({ page }) => {
  await mockGeocode(page, () => [PLACES.eiffel, PLACES.louvre, PLACES.bastille]);
  await page.goto("/");

  const start = page.locator("#itinerary-start-input");
  await start.fill("Paris");
  const options = page.locator('#itinerary-start-results [role="option"]');
  await expect(options).toHaveCount(3);
  await expect(start).toHaveAttribute("aria-expanded", "true");

  await start.press("ArrowDown");
  await start.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(start).toHaveAttribute("aria-activedescendant", "itinerary-start-results-option-1");
  await start.press("Enter");
  expect(await labels(page)).toEqual([PLACES.louvre.label]);
  await expect(start).toHaveAttribute("aria-expanded", "false");

  const end = page.locator("#itinerary-end-input");
  await end.fill("Paris");
  await expect(page.locator('#itinerary-end-results [role="option"]')).toHaveCount(3);
  await end.press("Escape");
  await expect(page.locator('#itinerary-end-results [role="option"]')).toHaveCount(0);
  await expect(end).toHaveValue("Paris");
  await end.press("Escape");
  await expect(end).toHaveValue("");

  // Une saisie abandonnée (perte de focus) rétablit aussi le point courant.
  await start.fill("autre chose");
  await page.locator("h1").click();
  await expect(start).toHaveValue(PLACES.louvre.label);
  expect(await labels(page)).toEqual([PLACES.louvre.label]);
});

test("moins de 3 caractères ne déclenche pas de requête", async ({ page }) => {
  let called = false;
  await page.route("**/api/geocode**", (route) => {
    called = true;
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await page.fill("#itinerary-start-input", "Pa");
  await page.waitForTimeout(500);

  expect(called).toBe(false);
});

test("un libellé d'adresse contenant du HTML est affiché comme du texte", async ({ page }) => {
  const label = '<img src=x onerror="window.__xss = true">Rue piégée';
  await mockGeocode(page, () => [{ label, lat: 48.8566, lon: 2.3522 }]);
  await page.goto("/");

  await page.locator("#itinerary-start-input").fill("piège");
  await expect(page.locator('#itinerary-start-results [role="option"]')).toContainText("<img");
  await expect(page.locator("#itinerary-start-results img")).toHaveCount(0);
  await page.locator('#itinerary-start-results [role="option"]').click();

  await expect(page.locator("#itinerary-start-input")).toHaveValue(label);
  await expect(page.locator("#waypoint-list .waypoint-label")).toContainText("<img");

  await page.locator(".wp-pin").hover();
  await expect(page.locator(".leaflet-tooltip")).toContainText("<img");
  await expect(page.locator(".leaflet-tooltip img")).toHaveCount(0);

  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});
