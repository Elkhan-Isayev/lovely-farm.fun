import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
    // test and server artefacts: changes there must not reload the page (a coverage run used to restart the dev server)
    watch: { ignored: ['**/coverage/**', '**/test-results/**', '**/playwright-report/**', '**/data/**', '**/.e2e-data/**'] },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'server/**/*.ts'],
      exclude: ['src/vite-env.d.ts', 'src/main.ts', 'server/index.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
