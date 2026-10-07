// README screenshots: builds the client, starts the server on a temporary database and photographs the game.
// Usage: npm run screenshots   (needs chromium: npx playwright install chromium)
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 3300;
const OUT = 'docs/screenshots';
const data = mkdtempSync(join(tmpdir(), 'farm-shots-'));
execSync('npx vite build', { stdio: 'ignore' });
const server = spawn(process.execPath, ['server/index.ts'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: data }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
const base = `http://localhost:${PORT}`;

const browser = await chromium.launch();
async function player(login, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU', ...opts });
  await ctx.addInitScript(() => localStorage.setItem('lovely-farm-lang', 'ru'));
  const p = await ctx.newPage();
  await p.goto(base + '/?dev');
  await p.click('[data-switch]');
  await p.fill('input[name=login]', login);
  await p.fill('input[name=password]', 'secret123');
  await p.fill('input[name=name]', name);
  await p.click('button[type=submit]');
  await p.waitForSelector('[data-start]');
  await p.click('[data-start]');
  while (await p.locator('.overlay .close').count()) await p.locator('.overlay .close').first().click();
  return p;
}
const closeAll = async (p) => {
  while (await p.locator('.overlay .close').count()) await p.locator('.overlay .close').first().click();
  // remove traces of the setup: floating numbers and toasts
  await p.evaluate(() => { if (window.__farm) window.__farm.renderer.floats = []; document.querySelectorAll('.toast').forEach((t) => t.remove()); });
};

try {
  // sign-in screen
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await guest.addInitScript(() => localStorage.setItem('lovely-farm-lang', 'ru'));
  await guest.goto(base);
  await guest.waitForTimeout(600);
  await guest.screenshot({ path: `${OUT}/auth.png` });

  // a rich farm: level, money, trees, animals, buildings
  const p = await player('alyona', 'Alyona');
  await p.evaluate(() => {
    const { game } = window.__farm;
    game.s.exp = 9000; game.s.gold = 50000; game.s.diamonds = 12; game.s.size = 12;
    game.s.cellar = { radish: 12, tomato: 8, corn: 9, a_chicken: 4, t_cherry: 6, wood: 20, film: 10 };
    for (let x = 0; x < 12; x++) game.place(x % 2 ? 'tree:apple' : 'tree:cherry', x, 0, false);
    for (let y = 1; y < 12; y++) game.place(y % 2 ? 'tree:pear' : 'tree:lemon', 0, y, false);
    game.place('building:mill', 9, 2, false);
    game.place('building:workshop', 9, 5, false);
    game.place('animal:cow', 9, 9, false);
    for (const [k, x] of [['animal:chicken', 2], ['animal:goat', 3], ['animal:sheep', 4], ['animal:mouse', 5], ['decor:gnome', 6], ['decor:balloons', 7], ['decor:pumpkinlamp', 8]]) game.place(k, x, 11, false);
    game.place('decor:pond', 1, 9, false);
    const crops = ['radish', 'tomato', 'cabbage', 'corn', 'strawberry', 'carrot', 'pepper'];
    for (let y = 3; y < 10; y++) for (let x = 2; x < 8; x++) {
      if (y < 4 && x < 4) continue;
      const c = crops[(y - 3) % crops.length];
      game.doDig(x, y); game.doPlant(x, y, c);
      game.s.plots[`${x},${y}`].growth = (x % 3 === 0 ? 0.5 : 1.1) * ({ radish: 4, tomato: 24, cabbage: 6, corn: 8, strawberry: 2, carrot: 48, pepper: 48 })[c] * 3600000;
      game.s.plots[`${x},${y}`].watered = x % 4 !== 1;
    }
    game.s.plots['3,5'].pest = 'crow';
    game.s.plots['5,7'].pest = 'toad';
    for (const o of game.s.objects) if (o.readyAt) o.readyAt = game.now() - 1;
    game.feedPet();
    game.changed();
    window.__farm.renderer.centerOn(12);
  });
  await p.waitForTimeout(500);
  await closeAll(p);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/farm.png` });

  await p.click('[data-nav=shop]');
  await p.click('[data-tab=animals]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/shop.png` });
  await closeAll(p);

  await p.evaluate(() => window.__farm.ctrl.cb.openBuilding(window.__farm.game.s.objects.find((o) => o.key === 'building:mill')));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/mill.png` });
  await closeAll(p);

  await p.evaluate(() => { const { game } = window.__farm; game.fillOrders(); });
  await p.locator('.round').first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/orders.png` });
  await closeAll(p);

  // visiting a villager
  await p.evaluate(() => { window.__farm.game.invite('n7'); window.__farm.ctx.visitNpc('n7'); });
  await p.waitForTimeout(800);
  await closeAll(p);
  await p.screenshot({ path: `${OUT}/visit.png` });
  await p.evaluate(() => window.__farm.ctx.goHome());

  // the showcase farms every player has
  for (const id of ['blossom', 'estate']) {
    await p.evaluate((id) => window.__farm.ctx.visitShowcase(id), id);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/showcase-${id}.png` });
  }
  await p.evaluate(() => window.__farm.ctx.goHome());

  // friends
  const q = await player('kolya', 'Kolya');
  await q.evaluate(() => window.__farm.sync.flush());
  await p.click('.nb.add');
  await p.fill('.modal input.input', 'Kolya');
  await p.click('[data-user] [data-add]');
  await q.evaluate(() => window.__farm.ctx.refreshFriends());
  await q.click('.nb.add');
  await q.waitForTimeout(300);
  await q.screenshot({ path: `${OUT}/friends.png` });
  await closeAll(q);

  // English UI and a phone
  await p.evaluate(() => { localStorage.setItem('lovely-farm-lang', 'en'); });
  await p.reload();
  await p.waitForTimeout(1200);
  await closeAll(p);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/farm-en.png` });

  const m = await player('mobile', 'Phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.waitForTimeout(800);
  await m.screenshot({ path: `${OUT}/mobile.png` });
  console.log('screenshots saved to', OUT);
} finally {
  await browser.close();
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
