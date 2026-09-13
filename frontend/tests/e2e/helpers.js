import { expect } from "@playwright/test";

/**
 * Simule un vrai clic souris sur la carte à une coordonnée géographique
 * donnée, via la projection Leaflet (window.__map, exposé par main.js pour
 * les tests). Plus fidèle que d'appeler directement les fonctions internes
 * de l'app.
 */
export async function clickMapAt(page, lat, lon, options = {}) {
  const point = await mapPointAt(page, lat, lon);
  await page.mouse.click(point.x, point.y, options);
}

/** Position absolue dans la page d'une coordonnée géographique de la carte. */
export async function mapPointAt(page, lat, lon) {
  const point = await page.evaluate(
    ([lat, lon]) => {
      const p = window.__map.latLngToContainerPoint([lat, lon]);
      return { x: p.x, y: p.y };
    },
    [lat, lon]
  );
  const box = await page.locator("#map").boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
}

/** Active un onglet de la sidebar : "route", "loop" ou "saved". */
export async function openTab(page, tab) {
  const button = page.locator(`[role="tab"][data-tab="${tab}"]`);
  await button.click();
  await expect(button).toHaveAttribute("aria-selected", "true");
}

/** Déplie le panneau "Options du trajet" (limite de vitesse, zones à
 * éviter), replié par défaut. */
export async function openRouteOptions(page) {
  const details = page.locator("#route-options");
  if (!(await details.evaluate((el) => el.open))) {
    await details.locator("summary").click();
  }
  await expect(page.locator("#speed-limit-input")).toBeVisible();
}

export function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}
