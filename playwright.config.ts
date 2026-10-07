import { defineConfig } from '@playwright/test';

const PORT = 3200;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 }, locale: 'en-GB' },
  webServer: {
    // every run starts with a fresh temporary database
    command: `npx vite build && rm -rf .e2e-data && PORT=${PORT} DATA_DIR=.e2e-data node server/index.ts`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
