import { defineConfig, type Plugin } from 'vitest/config';
import { CSP } from './server/app.ts';

/**
 * The static build (GitHub Pages: VITE_STATIC=1) has no server to send security headers,
 * so the page carries the same Content-Security-Policy in a <meta> tag
 * (frame-ancestors cannot be set that way, the rest applies).
 */
function staticCsp(): Plugin {
  const policy = CSP.split('; ').filter((d) => !d.startsWith('frame-ancestors')).join('; ');
  return {
    name: 'static-csp',
    apply: 'build',
    transformIndexHtml: (html) => (process.env.VITE_STATIC === '1'
      ? html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
      : html),
  };
}

export default defineConfig({
  // GitHub Pages serves the game from /lovely-farm.fun/ (VITE_BASE); everything else from /
  base: process.env.VITE_BASE ?? '/',
  plugins: [staticCsp()],
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
