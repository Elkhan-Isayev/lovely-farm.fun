// Repository rules that are easy to break by accident.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'data', '.git', '.ai', '.e2e-data', 'test-results', 'playwright-report', 'art', 'public']);
const TEXT = new Set(['.ts', '.mjs', '.js', '.json', '.md', '.html', '.css', '.py', '.yml', '.yaml', '.sh', '']);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (TEXT.has(extname(name)) && name !== 'package-lock.json') out.push(p);
  }
  return out;
}

describe('repository', () => {
  it('is English: Russian text lives only in src/i18n', () => {
    const cyrillic = /[\u0400-\u04FF]/;
    const offenders = files('.')
      .filter((f) => !f.startsWith(join('src', 'i18n')))
      .filter((f) => cyrillic.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('deploy scripts are valid bash and executable; the stack publishes only 80/443', () => {
    for (const f of ['deploy/setup-server.sh', 'deploy/deploy.sh', 'deploy/backup.sh']) {
      execFileSync('bash', ['-n', f]); // throws on a syntax error
      expect(statSync(f).mode & 0o111).not.toBe(0);
      expect(readFileSync(f, 'utf8')).toMatch(/^#!\/usr\/bin\/env bash\nset -euo pipefail|^#!\/usr\/bin\/env bash\n(#.*\n)+set -euo pipefail/);
    }
    const compose = readFileSync('deploy/docker-compose.yml', 'utf8');
    const published = [...compose.matchAll(/^\s+- "(\d+):\d+(\/udp)?"$/gm)].map((m) => m[1]);
    expect([...new Set(published)].sort()).toEqual(['443', '80']);
    expect(compose).toContain('TRUST_PROXY: "1"');
    expect(compose).toContain('read_only: true');
  });
});
