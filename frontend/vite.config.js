import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  test: {
    // Explicite : sans ça, Vitest ramasserait aussi les *.spec.js Playwright
    // de tests/e2e/.
    include: ["tests/unit/**/*.test.js"],
    environment: "node",
  },
});
