/**
 * Simule un vrai clic souris sur la carte à une coordonnée géographique donnée,
 * via la projection Leaflet (window.__map exposé par main.js pour les tests).
 * Plus fidèle qu'appeler directement les fonctions internes de l'app.
 */
export async function clickMapAt(page, lat, lon) {
  const point = await page.evaluate(
    ([lat, lon]) => {
      const p = window.__map.latLngToContainerPoint([lat, lon]);
      return { x: p.x, y: p.y };
    },
    [lat, lon]
  );
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

export function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}
