import { test, expect } from "@playwright/test";
import { clickMapAt, collectPageErrors, openTab } from "./helpers.js";

const DRAFT_KEY = "circuit-forgery:draft:v1";

test("un trajet non sauvegardé est restauré après rechargement de la page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate((key) => localStorage.removeItem(key), DRAFT_KEY);
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);

  // Laisse le temps au debounce de l'autosave (800ms) d'écrire le brouillon.
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY))
    .not.toBeNull();

  await page.reload();

  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  const waypoints = await page.evaluate(() => window.__getWaypoints());
  expect(waypoints).toHaveLength(2);
});

test("effacer les points supprime aussi le brouillon", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  await page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY))
    .not.toBeNull();

  await page.locator("#clear-route-btn").click();

  const draft = await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY);
  expect(draft).toBeNull();
});

const readDraft = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), DRAFT_KEY);
const parisView = (page) =>
  page.evaluate(() => window.__map.setView([48.865, 2.323], 13, { animate: false }));

test("après restauration du brouillon, un nouveau point a un identifiant unique", async ({ page }) => {
  // Régression : le compteur d'identifiants repartait de 1 au chargement, le
  // point ajouté après restauration reprenait l'identifiant d'un point
  // restauré, et le supprimer supprimait les deux.
  await page.goto("/");
  await parisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect.poll(() => readDraft(page)).not.toBeNull();

  await page.reload();
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
  await parisView(page);
  await clickMapAt(page, 48.87, 2.36);

  const ids = await page.evaluate(() => window.__getWaypoints().map((p) => p.id));
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);

  await page.locator("#waypoint-list li").nth(1).locator("button", { hasText: "✕" }).click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(2);
});

test("le brouillon restauré affiche le tracé des points actuels", async ({ page }) => {
  // Régression : le brouillon enregistrait les nouveaux points avec le tracé
  // calculé pour les précédents.
  await page.goto("/");
  await parisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);

  await clickMapAt(page, 48.87, 2.36);
  await expect.poll(async () => (await readDraft(page))?.computedRoute?.leg_boundaries?.length).toBe(3);
  const distance = await page.locator("#route-distance").textContent();

  await page.reload();
  await expect(page.locator("#waypoint-list li")).toHaveCount(3);
  await expect(page.locator("#route-distance")).toHaveText(distance);
});

test("effacer juste après une modification ne laisse pas de brouillon", async ({ page }) => {
  await page.goto("/");
  await parisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect.poll(() => readDraft(page)).not.toBeNull();

  // Modification puis effacement dans le délai de l'autosave : l'écriture
  // programmée ne doit pas recréer le brouillon effacé.
  await clickMapAt(page, 48.87, 2.36);
  await page.locator("#clear-route-btn").click();
  await page.waitForTimeout(1500);
  expect(await readDraft(page)).toBeNull();
});

test("le mode modification d'un trajet sauvegardé survit au rechargement", async ({ page, request }) => {
  const name = "Trajet Playwright Brouillon Edition";
  await page.goto("/");
  await parisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.fill("#save-route-name-input", name);
  await page.locator("#save-route-btn").click();
  await openTab(page, "saved");
  await page.locator("#saved-routes-list li", { hasText: name }).locator("button", { hasText: "✎" }).click();

  await parisView(page);
  await clickMapAt(page, 48.87, 2.36);
  await expect.poll(async () => (await readDraft(page))?.editingRouteId ?? null).not.toBeNull();

  await page.reload();
  await expect(page.locator("#update-route-btn")).toBeVisible();
  await expect(page.locator("#save-route-btn")).toBeHidden();

  const routes = await request.get("/api/routes").then((r) => r.json());
  for (const route of routes.filter((r) => r.name === name)) {
    await request.delete(`/api/routes/${route.id}`);
  }
});

test("stockage local inaccessible : l'application reste utilisable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Accès refusé", "SecurityError");
      },
    });
  });
  const errors = collectPageErrors(page);

  await page.goto("/");
  await parisView(page);
  await clickMapAt(page, 48.8566, 2.3522);
  await clickMapAt(page, 48.8738, 2.295);
  await expect(page.locator("#route-info")).not.toHaveClass(/hidden/);
  await page.waitForTimeout(1200); // laisse passer l'autosave
  await page.locator("#clear-route-btn").click();
  await expect(page.locator("#waypoint-list li")).toHaveCount(0);

  expect(errors, `Erreurs console/page inattendues : ${errors.join(", ")}`).toEqual([]);
});
