// End-to-end: two players sign up, become friends, visit each other and help.
import { expect, test, type Page } from '@playwright/test';
import { MESSAGES, type Lang } from '../../src/i18n';

async function register(page: Page, login: string, name: string) {
  await page.goto('/?dev');
  await page.click('[data-switch]');
  await page.fill('input[name=login]', login);
  await page.fill('input[name=password]', 'secret123');
  await page.fill('input[name=name]', name);
  await page.click('button[type=submit]');
  await expect(page.locator('.modal h2')).toHaveText('Welcome to your farm!');
  await page.click('[data-start]');
  while (await page.locator('.overlay .close').count()) await page.locator('.overlay .close').first().click();
}

/** Screen coordinates of a cell centre on the canvas. */
async function cellPoint(page: Page, x: number, y: number) {
  return page.evaluate(([x, y]) => {
    const r = (window as any).__farm.renderer;
    const wx = (x + 0.5 - (y + 0.5)) * 32, wy = (x + 0.5 + (y + 0.5)) * 16;
    return r.toScreen(wx, wy);
  }, [x, y]);
}

test('two players: friendship, visit, help and gift', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await register(alice, 'alice' + stamp, 'Alice');
  await register(bob, 'bob' + stamp, 'Bob');
  // Alice's farm is saved on the server
  await alice.evaluate(() => (window as any).__farm.sync.flush());

  // Bob finds Alice and sends a friend request
  await bob.click('.nb.add');
  await bob.fill('.modal input.input', 'Alice');
  await bob.click('[data-user] [data-add]');
  await expect(bob.locator('[data-user]')).toContainText('request sent');
  await bob.locator('.overlay .close').click();

  // Alice accepts
  await alice.evaluate(() => (window as any).__farm.ctx.refreshFriends());
  await alice.click('.nb.add');
  await alice.click('[data-incoming] [data-accept]');
  await expect(alice.locator('.modal [data-friend]')).toContainText('Bob');
  await alice.locator('.overlay .close').click();

  // Bob visits and waters a dry potato bed (row y=2 of the starter farm)
  await bob.evaluate(() => (window as any).__farm.ctx.refreshFriends());
  await bob.click('.nb.friend');
  await expect(bob.locator('.banner')).toContainText('Farm: Alice');
  const p = await cellPoint(bob, 3, 2);
  await bob.mouse.click(p.x, p.y);
  await expect(bob.locator('.banner')).toContainText('you can help 4 more times');
  // and gifts wood
  await bob.click('[data-home]');
  await bob.click('.nb.add');
  await bob.click('.modal [data-friend] [data-gift]');
  await bob.locator('.card', { hasText: 'Wood' }).click();
  await expect(bob.locator('.toast').last()).toContainText('Gift sent to Alice');

  // Alice receives the help and the gift
  await alice.evaluate(() => (window as any).__farm.sync.poll());
  await expect(alice.locator('.toast', { hasText: 'watered a bed' })).toBeVisible();
  const watered = await alice.evaluate(() => (window as any).__farm.game.s.plots['3,2'].watered);
  expect(watered).toBe(true);
  await alice.locator('.round').nth(1).click();
  await expect(alice.locator('[data-gift]')).toContainText('Wood');
});

test('language switches on every screen', async ({ page }) => {
  await page.goto('/');
  for (const lang of ['en', 'de', 'az', 'ru'] as Lang[]) {
    await page.click(`[data-lang=${lang}]`);
    await expect(page.locator('button[type=submit]')).toHaveText(MESSAGES[lang]['auth.signIn']);
  }
});

test('phone: the UI fits without horizontal scrolling', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await register(page, 'mob' + Date.now().toString(36), 'Phone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.locator('.toolbar')).toBeVisible();
});
