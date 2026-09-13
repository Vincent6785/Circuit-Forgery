import { request } from "@playwright/test";

// Données créées par les suites : trajets dont le nom contient "Playwright",
// points d'intérêt de test. Chaque test les supprime à la fin, mais un test
// qui échoue (ou un run interrompu) les laisse en base — et comme toutes les
// suites partagent la même base SQLite, un doublon suffit à faire échouer
// d'autres tests (sélecteurs ambigus, marqueur de POI sous un clic de carte).
const TEST_ROUTE_MARKER = "Playwright";
const TEST_POI_NAMES = new Set(["Station essence test"]);
const TEST_POI_PREFIX = "Piège";

/** Repart d'une base sans données de test résiduelles avant chaque run. */
export default async function globalSetup(config) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:8000";
  const api = await request.newContext({ baseURL });
  try {
    const routes = await (await api.get("/api/routes?view=summary")).json();
    for (const route of routes.filter((r) => r.name.includes(TEST_ROUTE_MARKER))) {
      await api.delete(`/api/routes/${route.id}`);
    }
    const pois = await (await api.get("/api/poi")).json();
    for (const poi of pois.filter((p) => TEST_POI_NAMES.has(p.name) || p.name.startsWith(TEST_POI_PREFIX))) {
      await api.delete(`/api/poi/${poi.id}`);
    }
  } finally {
    await api.dispose();
  }
}
