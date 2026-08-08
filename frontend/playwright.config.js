import { defineConfig, devices } from "@playwright/test";

// La stack Docker (graphhopper + backend) doit déjà tourner sur localhost:8000
// avant de lancer les tests — voir README.md, section "Tests".
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // les tests partagent la même base SQLite backend
  retries: 0,
  use: {
    baseURL: "http://localhost:8000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
