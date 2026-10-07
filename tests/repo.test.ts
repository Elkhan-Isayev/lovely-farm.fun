// Repository rules that are easy to break by accident.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'data', '.git', '.ai', '.e2e-data', 'test-results', 'playwright-report', 'art', 'public']);
const TEXT = new Set(['.ts', '.mjs', '.js', '.json', '.md', '.html', '.css', '.py', '.yml', '.yaml', '']);

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
});
