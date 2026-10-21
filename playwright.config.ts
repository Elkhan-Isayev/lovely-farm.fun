import { defineConfig } from '@playwright/test';

const PORT = 3200; // the full game: client + server, multiplayer
const STATIC_PORT = 3201; // the static build (GitHub Pages): no server API, the farm lives in localStorage

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: { viewport: { width: 1280, height: 800 }, locale: 'en-GB' },
  projects: [
    { name: 'server', testMatch: 'multiplayer.spec.ts', use: { baseURL: `http://localhost:${PORT}` } },
    { name: 'static', testMatch: 'static.spec.ts', use: { baseURL: `http://localhost:${STATIC_PORT}` } },
  ],
  webServer: [
    {
      // every run starts with a fresh temporary database
      command: `npx vite build && rm -rf .e2e-data && PORT=${PORT} DATA_DIR=.e2e-data node server/index.ts`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // the static build served as plain files (the Node server only hosts them; the client never calls /api)
      command: `VITE_STATIC=1 npx vite build --outDir .e2e-static --emptyOutDir && rm -rf .e2e-static-data && PORT=${STATIC_PORT} DATA_DIR=.e2e-static-data STATIC_DIR=.e2e-static node server/index.ts`,
      url: `http://localhost:${STATIC_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
