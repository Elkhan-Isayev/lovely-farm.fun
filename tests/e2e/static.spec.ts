// End-to-end: the static build (GitHub Pages) — no server, the farm lives in the browser.
import { expect, test } from '@playwright/test';
import { MESSAGES } from '../../src/i18n';

const en = MESSAGES.en;

test('play without a server: start, save in the browser, showcase farms, no API calls', async ({ page }) => {
  const apiCalls: string[] = [];
  const problems: string[] = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

  // a start screen: a name, an avatar and Play — no login, no password
  await page.goto('/?dev');
  await expect(page.locator('button[type=submit]')).toHaveText(en['auth.play']);
  await expect(page.locator('input[name=password]')).toHaveCount(0);
  await expect(page.locator('[data-switch]')).toHaveCount(0);
  await expect(page.locator('[data-local-hint]')).toContainText(en['auth.localHint']);
  await page.fill('input[name=name]', 'Pages Player');
  await page.click('[data-face="👨‍🌾"]');
  await page.click('button[type=submit]');
  await expect(page.locator('.modal h2')).toHaveText(en['welcome.title']);
  await page.click('[data-start]');
  while (await page.locator('.overlay .close').count()) await page.locator('.overlay .close').first().click();
  await expect(page.locator('.me-name')).toHaveText('Pages Player');

  // progress survives a reload: it is saved in localStorage
  await page.evaluate(async () => {
    const { game, sync } = (window as any).__farm;
    game.s.gold = 12345;
    game.changed();
    await sync.flush();
  });
  await page.reload();
  await expect(page.locator('.me-name')).toHaveText('Pages Player');
  expect(await page.evaluate(() => (window as any).__farm.game.s.gold)).toBe(12345);
  while (await page.locator('.overlay .close').count()) await page.locator('.overlay .close').first().click();

  // friends need a server (the window opens on the village); the showcase farms do not
  await page.click('.nb.add');
  await expect(page.locator('.modal-body')).toContainText(en['nb.mine'].replace(' ({n})', ''));
  await page.click('[data-tab=friends]');
  await expect(page.locator('.modal-body')).toContainText(en['nb.offline']);
  await page.click('[data-showcase=estate] [data-visit]');
  await expect(page.locator('.banner')).toContainText(en['showcase.estate']);
  await page.click('[data-home]');

  // the profile says where the progress lives instead of offering to log out
  await page.click('.me');
  await expect(page.locator('[data-logout]')).toHaveCount(0);
  await expect(page.locator('.modal [data-local-hint]')).toBeVisible();

  expect(apiCalls).toEqual([]);
  expect(problems.filter((p) => /Content Security Policy/i.test(p))).toEqual([]);
});
