// Repository rules that are easy to break by accident.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'data', '.git', '.ai', '.e2e-data', '.e2e-static', '.e2e-static-data', 'test-results', 'playwright-report', 'art', 'public']);
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

  it('no source file is git-ignored (an over-broad .gitignore once hid src/data/)', () => {
    const ignored = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', 'src', 'server', 'tests', 'scripts', 'public', '.github'], { encoding: 'utf8' });
    expect(ignored.trim()).toBe('');
  });

  it('CI publishes the static build to GitHub Pages and needs no secrets (the repository is public)', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci).toContain("VITE_STATIC: '1'");
    expect(ci).toContain('actions/deploy-pages@');
    expect(ci).toContain('run: npm run test:all');
    expect(ci).not.toMatch(/secrets\./);
    expect(ci).not.toMatch(/actions\/[a-z-]+@v[1-4]\b/); // nothing on the deprecated Node 20 runtime
  });
});
