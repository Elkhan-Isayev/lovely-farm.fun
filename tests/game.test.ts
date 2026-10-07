import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_PET_NAMES } from '../src/i18n/people';
import { Game, PET_NAME_RE, giftChoices, giftName, round2, HELP_LIMIT, type SocialPort } from '../src/core/game';
import { ITEMS, cropById, recipeById } from '../src/data/items';
import { expForLevel } from '../src/core/levels';
import { NPCS } from '../src/core/neighbors';
import { HOUR, dayIndex, key, newState, type FarmObject, type GameState } from '../src/core/state';

const T0 = new Date(2026, 9, 4, 12).getTime();

function setup(mod?: (s: GameState) => void) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  const s = newState();
  s.plots = {};
  s.objects = [];
  s.cellar = {};
  s.gold = 10_000;
  mod?.(s);
  const g = new Game(s);
  const toasts: string[] = [];
  g.on('toast', (x) => toasts.push(x.text));
  return { g, toasts };
}
const advance = (hours: number) => vi.setSystemTime(Date.now() + hours * HOUR);

describe('Game: time and resources', () => {
  it('starts a new game without a save', () => {
    const g = new Game(null);
    expect(g.isNew).toBe(true);
    expect(g.s.size).toBe(8);
  });

  it('game time runs at clock speed', () => {
    const { g } = setup();
    const n0 = g.now();
    advance(1);
    expect(g.now() - n0).toBe(HOUR);
    g.setSpeed(60);
    const n1 = g.now();
    vi.setSystemTime(Date.now() + 60_000);
    expect(g.now() - n1).toBe(HOUR);
  });

  it('XP raises the level and grants rewards', () => {
    const { g } = setup();
    const ups: number[] = [];
    g.on('levelup', (l) => ups.push(l));
    const gold = g.s.gold;
    g.addExp(expForLevel(3), 0, 0);
    expect(g.level).toBe(3);
    expect(ups).toEqual([2, 3]);
    expect(g.s.gold).toBe(gold + 100 + 150);
    expect(g.s.diamonds).toBe(6);
    g.addExp(0);
    expect(g.level).toBe(3);
  });

  it('spends coins and diamonds', () => {
    const { g, toasts } = setup((s) => { s.gold = 50; s.diamonds = 1; });
    expect(g.spend(60)).toBe(false);
    expect(g.spend(10, 2)).toBe(false);
    expect(toasts).toEqual(['Not enough coins', 'Not enough diamonds']);
    expect(g.spend(10, 0.5)).toBe(true);
    expect(g.s.gold).toBe(40);
    expect(g.s.diamonds).toBe(0.5);
  });

  it('cellar and storage entries disappear at zero', () => {
    const { g } = setup();
    g.addItem('radish', 2);
    g.addItem('radish', -2);
    expect(g.s.cellar.radish).toBeUndefined();
    g.addStorage('tree:apple');
    g.addStorage('tree:apple', -1);
    expect(g.s.storage['tree:apple']).toBeUndefined();
  });

  it('achievements grant diamonds per tier', () => {
    const { g } = setup();
    const got: string[] = [];
    g.on('achievement', (a) => got.push(a.name));
    const d0 = g.s.diamonds;
    g.stat('dug', 25);
    expect(got).toEqual(['Digger ★']);
    expect(g.s.diamonds).toBe(round2(d0 + 0.5));
    g.stat('dug', 3000);
    expect(g.s.achievements.dig).toBe(3);
    g.stat('dug', 1);
    expect(got).toHaveLength(3);
    g.stat('unknown');
    expect(g.s.stats.unknown).toBe(1);
  });

  it('addGold tracks earnings and shows a float', () => {
    const { g } = setup();
    const floats: string[] = [];
    g.on('float', (f) => floats.push(f.text));
    g.addGold(5, 1, 1);
    g.addGold(-5, 1, 1);
    g.addGold(0, 1, 1);
    expect(g.s.stats.earned).toBe(5);
    expect(floats).toEqual(['+5', '-5']);
  });
});

describe('Game: beds', () => {
  it('full cycle: dig → plant → water → fertilize → harvest → clear', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no crows or toads: a pest would stop the growth
    const { g } = setup();
    expect(g.canDig(1, 1)).toBeNull();
    g.doDig(1, 1);
    expect(g.plot(1, 1)!.state).toBe('soil');
    expect(g.canDig(1, 1)).toBe('Already dug here');
    expect(g.canPlant(1, 1, 'radish')).toBeNull();
    g.doPlant(1, 1, 'radish');
    const p = g.plot(1, 1)!;
    expect(g.cropStage(p)).toBe(0);
    g.doWater(1, 1);
    expect(p.watered).toBe(true);
    expect(p.growth).toBe(0.4 * HOUR);
    g.doWater(1, 1); // not twice
    expect(p.growth).toBe(0.4 * HOUR);
    g.doFertilize(1, 1);
    expect(p.fertilized).toBe(true);
    expect(p.growth).toBe(1.0 * HOUR);
    expect(g.cropStage(p)).toBe(1);
    expect(g.isRipe(p)).toBe(false);
    expect(g.timeLeft(p)).toBe(3 * HOUR);
    advance(1);
    g.tick(0.1);
    expect(g.cropStage(p)).toBe(2);
    advance(2.1);
    g.tick(0.1);
    expect(g.isRipe(p)).toBe(true);
    expect(g.cropStage(p)).toBe(3);
    g.doHarvestPlot(1, 1);
    expect(g.s.cellar.radish).toBe(1);
    expect(p.state).toBe('withered');
    expect(p.growth).toBe(-1);
    expect(g.cropStage(p)).toBe(4);
    g.doClear(1, 1);
    expect(p.state).toBe('soil');
    expect(g.cropStage(p)).toBe(-1);
    expect(g.s.stats.dug).toBe(2);
    expect(g.s.stats.harvested).toBe(1);
  });

  it('validates digging and planting', () => {
    const { g } = setup((s) => { s.gold = 5; });
    expect(g.canDig(-1, 0)).toBe('Outside your farm');
    expect(g.canDig(0, 0)).toBe('Not enough coins');
    g.s.objects.push({ id: 99, key: 'decor:gnome', x: 2, y: 2, w: 1, h: 1, flip: false });
    g.rebuildOcc();
    g.s.gold = 100;
    expect(g.canDig(2, 2)).toBe('This spot is taken');
    expect(g.canPlant(3, 3, 'radish')).toBe('Dig the bed first');
    g.doDig(3, 3);
    expect(g.canPlant(3, 3, 'gerbera')).toBe('Requires level 35');
    g.s.gold = 1;
    expect(g.canPlant(3, 3, 'radish')).toBe('Not enough coins');
  });

  it('planting on a non-soil cell refunds the seeds', () => {
    const { g } = setup((s) => { s.gold = 0; });
    g.doPlant(5, 5, 'tomato');
    expect(g.s.gold).toBe(cropById.tomato.cost);
  });

  it('withers when not harvested in time', () => {
    const { g } = setup();
    g.doDig(0, 0);
    g.doPlant(0, 0, 'strawberry');
    advance(4.1);
    g.tick(10);
    expect(g.plot(0, 0)!.state).toBe('withered');
    expect(g.plot(0, 0)!.growth).not.toBe(-1);
    g.doHarvestPlot(0, 0);
    expect(g.s.cellar.strawberry).toBeUndefined();
  });

  it('fertilizing only after watering and before ripening', () => {
    const { g } = setup();
    g.doDig(0, 0);
    g.doPlant(0, 0, 'radish');
    g.doFertilize(0, 0);
    expect(g.plot(0, 0)!.fertilized).toBe(false);
    g.doFertilize(9, 9);
    g.doWater(9, 9);
    g.doChase(9, 9);
    g.doClear(9, 9);
    g.doHarvestPlot(9, 9);
    expect(g.s.plots[key(9, 9)]).toBeUndefined();
  });

  it('pests appear, stop growth and can be chased; a scarecrow keeps crows away', () => {
    const { g } = setup();
    for (let x = 0; x < 4; x++) { g.doDig(x, 0); g.doPlant(x, 0, 'pepper'); }
    g.s.objects.push({ id: 50, key: 'decor:scarecrow', x: 0, y: 1, w: 1, h: 1, flip: false });
    g.rebuildOcc();
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0); // always "yes" and always a crow
    advance(1);
    g.tick(0.25);
    rnd.mockRestore();
    // cells 0..3 are within the scarecrow radius → no crows
    expect(Object.values(g.s.plots).some((p) => p.pest)).toBe(false);
    g.s.plots = {};
    g.doDig(7, 7);
    g.doPlant(7, 7, 'pepper');
    const r2 = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9).mockReturnValue(1);
    advance(1);
    g.tick(0.25);
    r2.mockRestore();
    const p = g.plot(7, 7)!;
    expect(p.pest).toBe('toad');
    const before = p.growth;
    advance(2);
    g.tick(0.25);
    expect(p.growth).toBe(before);
    g.doChase(7, 7);
    expect(p.pest).toBeNull();
    expect(g.s.stats.pests).toBe(1);
  });

  it('no retroactive pests after a long absence', () => {
    const { g } = setup();
    g.doDig(0, 0);
    g.doPlant(0, 0, 'pepper');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    advance(10);
    g.tick(3600);
    expect(g.plot(0, 0)!.pest).toBeNull();
  });
});

describe('Game: objects', () => {
  it('buying a tree, harvesting, moving, flipping, storage', () => {
    const { g, toasts } = setup((s) => { s.exp = expForLevel(5); });
    expect(g.place('tree:apple', 2, 2, false)).toBe(true);
    const o = g.objectAt(2, 2)!;
    expect(o.readyAt).toBe(g.now() + 72 * HOUR);
    expect(g.s.gold).toBe(10_000 - 360);
    expect(g.objectReady(o)).toBe(false);
    g.doHarvestObject(o);
    expect(g.s.cellar.t_apple).toBeUndefined();
    advance(72);
    expect(g.objectReady(o)).toBe(true);
    g.doHarvestObject(o);
    expect(g.s.cellar.t_apple).toBe(1);
    expect(g.place('tree:apple', 2, 2, false)).toBe(false);
    expect(toasts).toContain('Can\'t place it here');
    expect(g.move(o, 3, 3)).toBe(true);
    expect(g.objectAt(2, 2)).toBeUndefined();
    expect(g.move(o, 99, 99)).toBe(false);
    g.flip(o);
    expect(o.flip).toBe(true);
    g.toStorage(o);
    expect(g.s.storage['tree:apple']).toBe(1);
    expect(g.place('tree:apple', 0, 0, true)).toBe(true);
    expect(g.s.storage['tree:apple']).toBeUndefined();
    expect(g.place('tree:apple', 1, 1, true)).toBe(false);
  });

  it('animals yield products and XP', () => {
    const { g } = setup((s) => { s.exp = expForLevel(5); });
    g.place('animal:cow', 0, 0, false);
    const cow = g.objectAt(1, 1)!;
    expect(cow.w).toBe(2);
    advance(48);
    g.doHarvestObject(cow);
    expect(g.s.cellar.a_cow).toBe(1);
    g.doHarvestObject({ ...cow }); // unknown object is ignored
    expect(g.s.cellar.a_cow).toBe(1);
  });

  it('level, price, diamonds and unique buildings', () => {
    const { g, toasts } = setup((s) => { s.diamonds = 0; });
    expect(g.place('animal:turkey', 0, 0, false)).toBe(false);
    expect(toasts.at(-1)).toBe('Requires level 35');
    g.s.exp = expForLevel(20);
    expect(g.place('decor:globe', 0, 0, false)).toBe(false);
    expect(toasts.at(-1)).toBe('Not enough diamonds');
    g.s.diamonds = 3;
    expect(g.place('decor:globe', 0, 0, false)).toBe(true);
    expect(g.place('building:mill', 3, 3, false)).toBe(true);
    expect(g.place('building:mill', 5, 5, false)).toBe(false);
    expect(toasts.at(-1)).toBe('You already have this building');
    expect(g.place('building:greenhouse', 5, 0, true)).toBe(false);
  });

  it('prices of every object kind', () => {
    const { g } = setup();
    expect(g.priceOf('tree:dates')).toMatchObject({ gold: 0, diamonds: 10, level: 15, exp: 500 });
    expect(g.priceOf('animal:cow')).toMatchObject({ gold: 4800, level: 5, exp: 480 });
    expect(g.priceOf('decor:gnome')).toMatchObject({ gold: 150, exp: 8 });
    expect(g.priceOf('decor:alien')).toMatchObject({ diamonds: 5, exp: 50 });
    expect(g.priceOf('building:kitchen')).toMatchObject({ gold: 6000, exp: 600 });
  });

  it('isFree respects bounds, beds and cells the farmer is heading to', () => {
    const { g } = setup();
    g.doDig(1, 1);
    expect(g.isFree(1, 1, 1, 1)).toBe(false);
    g.pending.add(key(2, 2));
    expect(g.isFree(2, 2, 1, 1)).toBe(false);
    expect(g.isFree(7, 7, 2, 2)).toBe(false);
    expect(g.isFree(6, 6, 2, 2)).toBe(true);
  });

  it('a building with products cannot be stored', () => {
    const { g, toasts } = setup((s) => { s.exp = expForLevel(10); });
    g.place('building:mill', 0, 0, false);
    const mill = g.objectAt(0, 0)!;
    mill.jobs = [{ recipe: 'cornflour', startsAt: 0, endsAt: 1 }];
    g.toStorage(mill);
    expect(toasts.at(-1)).toBe('Collect the products first');
  });
});

describe('Game: trading and expansion', () => {
  it('sells single items and everything', () => {
    const { g, toasts } = setup((s) => { s.gold = 0; s.cellar = { radish: 3, wood: 2, a_cow: 1 }; });
    g.sell('radish', 1);
    expect(g.s.gold).toBe(24);
    g.sell('radish', 99);
    expect(g.s.gold).toBe(72);
    g.sell('radish', 1);
    expect(g.s.gold).toBe(72);
    g.sellAll((id) => id !== 'wood');
    expect(g.s.gold).toBe(222);
    expect(g.s.cellar).toEqual({ wood: 2 });
    expect(toasts.at(-1)).toBe('Sold for 150 coins');
    g.sellAll(() => false);
  });

  it('buys materials', () => {
    const { g } = setup((s) => { s.gold = 1100; });
    g.buyMaterial('film');
    expect(g.s.cellar.film).toBe(1);
    g.buyMaterial('film');
    expect(g.s.cellar.film).toBe(1);
  });

  it('expansion: coins, diamonds, neighbours', () => {
    const { g, toasts } = setup((s) => { s.gold = 600; s.diamonds = 5; });
    g.expand('diamonds'); // 10×10 cannot be bought with diamonds
    expect(g.s.size).toBe(8);
    g.expand('gold');
    expect(g.s.size).toBe(10);
    g.expand('neighbors');
    expect(toasts.at(-1)).toBe('You need 10 neighbours');
    g.expand('gold'); // 12×12 cannot be bought with coins
    expect(g.s.size).toBe(10);
    g.expand('diamonds');
    expect(g.s.size).toBe(12);
    g.s.neighbors = NPCS.slice(0, 20).map((n) => n.id);
    g.friends = Array.from({ length: 5 }, (_, i) => ({ id: i, name: 'f', login: 'f', level: 1, face: '🙂', helpLeft: 5, giftSent: false }));
    g.expand('neighbors');
    expect(g.s.size).toBe(14);
    g.s.size = 18;
    expect(g.nextExpansion()).toBeUndefined();
    g.expand('gold');
    expect(g.s.size).toBe(18);
  });
});

describe('Game: production', () => {
  it('job queue, collecting, XP and limits', () => {
    const { g, toasts } = setup((s) => { s.exp = expForLevel(6); s.cellar = { corn: 12 }; });
    g.place('building:mill', 0, 0, false);
    const mill = g.objectAt(0, 0)!;
    g.startJob(mill, 'sunoil');
    expect(toasts.at(-1)).toBe('Requires level 21');
    g.startJob(mill, 'cornflour');
    g.startJob(mill, 'cornflour');
    g.startJob(mill, 'cornflour');
    g.startJob(mill, 'cornflour');
    expect(toasts.at(-1)).toBe('The queue is full');
    expect(mill.jobs!.map((j) => (j.endsAt - j.startsAt) / HOUR)).toEqual([2, 2, 2]);
    expect(mill.jobs![1].startsAt).toBe(mill.jobs![0].endsAt);
    expect(g.collectJobs(mill)).toBe(0);
    advance(4);
    expect(g.objectReady(mill)).toBe(true);
    expect(g.collectJobs(mill)).toBe(2);
    expect(g.s.cellar.cornflour).toBe(2);
    expect(g.s.stats.crafted).toBe(2);
    mill.jobs = [];
    g.s.cellar = {};
    g.startJob(mill, 'cornflour');
    expect(toasts.at(-1)).toBe('Not enough produce in the cellar');
  });

  it('the workshop crafts objects into storage', () => {
    const { g } = setup((s) => { s.exp = expForLevel(5); s.cellar = { wood: 20, film: 10 }; });
    g.place('building:workshop', 0, 0, false);
    const ws = g.objectAt(0, 0)!;
    ws.jobs = undefined;
    g.startJob(ws, 'r_greenhouse');
    advance(4);
    g.collectJobs(ws);
    expect(g.s.storage['building:greenhouse']).toBe(1);
    expect(g.collectJobs({ ...ws, jobs: undefined })).toBe(0);
  });

  it('greenhouse: plant all beds, harvest, running out of coins', () => {
    const { g, toasts } = setup((s) => { s.storage = { 'building:greenhouse': 1 }; s.gold = 10 * 5; });
    g.place('building:greenhouse', 0, 0, true);
    const gh = g.objectAt(0, 0)!;
    expect(gh.slots).toHaveLength(12);
    g.greenPlant(gh, 'radish');
    expect(gh.slots!.filter((s) => s.crop)).toHaveLength(5);
    expect(toasts.at(-1)).toBe('Not enough coins');
    expect(g.greenReady(gh)).toBe(0);
    g.greenHarvest(gh);
    advance(4);
    expect(g.greenReady(gh)).toBe(5);
    expect(g.objectReady(gh)).toBe(true);
    g.greenHarvest(gh);
    expect(g.s.cellar.radish).toBe(5);
    g.s.gold = 0;
    g.greenPlant(gh, 'radish');
    expect(g.greenReady({ ...gh, slots: undefined })).toBe(0);
  });

  it('product price = 1.5 × inputs + 10', () => {
    const r = recipeById.salad;
    const raw = Object.entries(r.inputs).reduce((s, [id, n]) => s + ITEMS[id].price * n, 0);
    expect(ITEMS.salad.price).toBe(Math.round(raw * 1.5 + 10));
  });
});

describe('Game: orders', () => {
  it('orders are built from available items and can be completed', () => {
    const { g, toasts } = setup();
    g.place('tree:cherry', 0, 0, false);
    g.s.exp = expForLevel(6);
    g.place('building:mill', 2, 2, false);
    g.place('animal:cow', 5, 5, false);
    const c = g.orderCandidates();
    expect(c).toContain('radish');
    expect(c).toContain('t_cherry');
    expect(c).toContain('a_cow');
    expect(c).toContain('cornflour');
    g.fillOrders();
    expect(g.s.orders).toHaveLength(3);
    const o = g.s.orders[0];
    g.completeOrder(o);
    expect(toasts.at(-1)).toBe('Not enough produce in the cellar');
    for (const [id, n] of Object.entries(o.items)) g.addItem(id, n);
    o.diamonds = 1;
    o.material = 'wood';
    const gold = g.s.gold, dia = g.s.diamonds;
    g.completeOrder(o);
    expect(g.s.gold).toBe(gold + o.gold);
    expect(g.s.diamonds).toBe(dia + 1);
    expect(g.s.cellar.wood).toBe(1);
    expect(g.s.orders).toHaveLength(3);
    expect(g.s.orders).not.toContain(o);
  });

  it('an order can be replaced once an hour', () => {
    const { g } = setup();
    g.fillOrders();
    const o = g.s.orders[1];
    g.replaceOrder(o);
    expect(g.s.orders).not.toContain(o);
    const o2 = g.s.orders[1];
    g.replaceOrder(o2);
    expect(g.s.orders).toContain(o2);
    advance(1.01);
    g.replaceOrder(o2);
    expect(g.s.orders).not.toContain(o2);
  });

  it('random order rewards', () => {
    const { g } = setup();
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const o = g.makeOrder();
    expect(o.diamonds).toBe(1);
    expect(o.material).toBe('wood');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const o2 = g.makeOrder();
    expect(o2.diamonds).toBe(0);
    expect(o2.material).toBeUndefined();
  });
});

describe('Game: neighbours, visits and gifts', () => {
  let g: Game;
  let toasts: string[];
  beforeEach(() => { ({ g, toasts } = setup()); });

  it('inviting villagers is limited by level', () => {
    for (const n of NPCS.slice(0, 6)) g.invite(n.id);
    expect(g.s.neighbors).toHaveLength(6);
    g.invite(NPCS[0].id);
    expect(g.s.neighbors).toHaveLength(6);
    g.invite(NPCS[10].id);
    expect(g.s.neighbors).toHaveLength(6);
    expect(toasts.at(-1)).toBe('More neighbours at the next level');
    expect(g.neighborCount()).toBe(6);
  });

  it('visiting a villager: help, daily limit, help remembered for the day', async () => {
    const npc = NPCS[3];
    g.startVisit({ type: 'npc', npc });
    expect(g.visitName()).toBe(npc.name);
    const farm = g.visit!.farm;
    const cells = Object.entries(farm.plots).filter(([, p]) => p.pest || !p.watered).map(([k]) => k.split(',').map(Number));
    expect(cells.length).toBeGreaterThan(HELP_LIMIT);
    expect(g.helpLeft()).toBe(HELP_LIMIT);
    const gold = g.s.gold;
    for (const [x, y] of cells.slice(0, HELP_LIMIT + 1)) await g.doHelp(x, y);
    expect(g.helpLeft()).toBe(0);
    expect(g.s.gold).toBeGreaterThan(gold);
    expect(g.s.stats.helped).toBe(HELP_LIMIT);
    expect(toasts.at(-1)).toContain('will thank you');
    g.endVisit();
    expect(g.visit).toBeNull();
    g.startVisit({ type: 'npc', npc });
    const [x0, y0] = cells[0];
    expect(g.helpKind(x0, y0)).toBeNull();
    expect(g.helpKind(-5, -5)).toBeNull();
    g.endVisit();
    await g.doHelp(0, 0);
    expect(g.helpLeft()).toBe(0);
    expect(g.visitName()).toBe('');
  });

  it('visiting a real friend goes through the server', async () => {
    const help = vi.fn<SocialPort['help']>()
      .mockResolvedValueOnce({ ok: true, left: 4 })
      .mockResolvedValueOnce({ ok: false, left: 4, error: 'nope' })
      .mockRejectedValueOnce(new Error('offline'));
    g.social = { help, gift: vi.fn() };
    const friend = { id: 7, name: 'Lena', login: 'lena', level: 47, face: '👩', helpLeft: 5, giftSent: false };
    const plots = {
      '1,1': { state: 'growing' as const, crop: 'radish', growth: 0, watered: true, fertilized: false, pest: 'crow' as const },
      '2,2': { state: 'growing' as const, crop: 'radish', growth: 0, watered: false, fertilized: false, pest: null },
      '3,3': { state: 'growing' as const, crop: 'radish', growth: 0, watered: false, fertilized: false, pest: null },
    };
    g.startVisit({ type: 'friend', friend }, { size: 10, plots, objects: [], growStage: {} });
    expect(g.visitName()).toBe('Lena');
    await g.doHelp(1, 1);
    expect(help).toHaveBeenCalledWith(7, 1, 1, 'chase');
    expect(plots['1,1'].pest).toBeNull();
    expect(friend.helpLeft).toBe(4);
    await g.doHelp(2, 2);
    expect(toasts.at(-1)).toBe('nope');
    expect(plots['2,2'].watered).toBe(false);
    await g.doHelp(3, 3);
    expect(toasts.at(-1)).toBe('No connection to the server');
    g.social = null;
    await g.doHelp(2, 2);
    expect(plots['2,2'].watered).toBe(false);
  });

  it('help is not applied if the player went home while the server answered', async () => {
    let resolve!: (v: { ok: boolean; left: number }) => void;
    g.social = { help: () => new Promise((r) => { resolve = r; }), gift: vi.fn() };
    const friend = { id: 1, name: 'A', login: 'a', level: 1, face: '🙂', helpLeft: 5, giftSent: false };
    const plots = { '0,0': { state: 'growing' as const, crop: 'radish', growth: 0, watered: false, fertilized: false, pest: null } };
    g.startVisit({ type: 'friend', friend }, { size: 8, plots, objects: [], growStage: {} });
    const p = g.doHelp(0, 0);
    g.endVisit();
    resolve({ ok: true, left: 4 });
    await p;
    expect(plots['0,0'].watered).toBe(false);
    expect(g.s.stats.helped).toBeUndefined();
  });

  it('friend events: gifts and help; duplicates are ignored', () => {
    g.doDig(1, 1);
    g.doPlant(1, 1, 'radish');
    g.doDig(2, 2);
    g.doPlant(2, 2, 'radish');
    g.plot(2, 2)!.pest = 'crow';
    g.applyEvents([
      { id: 1, type: 'gift', fromName: 'Lena', fromFace: '👩', key: 'item:wood' },
      { id: 2, type: 'help', fromName: 'Kolya', fromFace: '👨', x: 1, y: 1, kind: 'water' },
      { id: 3, type: 'help', fromName: 'Kolya', fromFace: '👨', x: 2, y: 2, kind: 'chase' },
      { id: 4, type: 'help', fromName: 'Kolya', fromFace: '👨', x: 6, y: 6, kind: 'water' },
    ]);
    expect(g.s.gifts).toEqual([{ from: 'Lena', key: 'item:wood' }]);
    expect(g.plot(1, 1)!.watered).toBe(true);
    expect(g.plot(2, 2)!.pest).toBeNull();
    expect(g.appliedEvents).toEqual([1, 2, 3, 4]);
    g.applyEvents([{ id: 1, type: 'gift', fromName: 'Lena', fromFace: '👩', key: 'item:wood' }]);
    expect(g.s.gifts).toHaveLength(1);
    expect(toasts).toContain('Lena sent you a gift: Wood');
    g.applyEvents([]);
  });

  it('gifts: to villagers once a day, to friends via the server, accepting gifts', async () => {
    g.sendGift('n1');
    g.sendGift('n1');
    expect(g.s.giftsSent.n1).toBe(dayIndex());
    expect(toasts.filter((x) => x.startsWith('Gift sent'))).toHaveLength(1);
    const gift = vi.fn<SocialPort['gift']>().mockResolvedValueOnce({ ok: false, error: 'already' }).mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('x'));
    const f = { id: 2, name: 'B', login: 'b', level: 1, face: '🙂', helpLeft: 5, giftSent: false };
    await g.sendFriendGift(f, 'item:wood');
    expect(g.social).toBeNull();
    g.social = { help: vi.fn(), gift };
    await g.sendFriendGift(f, 'item:wood');
    expect(toasts.at(-1)).toBe('already');
    await g.sendFriendGift(f, 'item:wood');
    expect(f.giftSent).toBe(true);
    await g.sendFriendGift(f, 'item:wood');
    expect(gift).toHaveBeenCalledTimes(2);
    f.giftSent = false;
    await g.sendFriendGift(f, 'item:wood');
    expect(toasts.at(-1)).toBe('No connection to the server');
    g.s.gifts = [{ from: 'x', key: 'item:wood' }, { from: 'y', key: 'animal:pig' }];
    g.acceptGift(0);
    g.acceptGift(0);
    g.acceptGift(5);
    expect(g.s.cellar.wood).toBe(1);
    expect(g.s.storage['animal:pig']).toBe(1);
  });

  it('daily bonus, streak and wished-for gifts', () => {
    g.s.neighbors = ['n0', 'n1', 'n2', 'n3'];
    g.s.wish = 'item:film';
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const d = g.daily()!;
    expect(d.streak).toBe(1);
    expect(d.gifts).toBe(3);
    expect(g.s.gifts.every((x) => x.key === 'item:film' && x.npc)).toBe(true);
    expect(g.daily()).toBeNull();
    advance(24);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const d2 = g.daily()!;
    expect(d2.streak).toBe(2);
    expect(d2.bonus).toBe(100 + 10);
    advance(72);
    expect(g.daily()!.streak).toBe(1);
  });

  it('gifts by level and their names', () => {
    expect(giftChoices(1).map((x) => x.key)).toEqual(['item:wood', 'item:straw', 'item:nails', 'item:film']);
    expect(giftChoices(99).length).toBeGreaterThan(10);
    expect(giftName('item:wood')).toBe('Wood');
    expect(giftName('animal:pig')).toBe('Pig');
  });
});

describe('Game: pet', () => {
  it('feeding, being full, petting and chasing pests on its own', () => {
    const { g, toasts } = setup();
    expect(g.petHappy()).toBe(false);
    g.feedPet();
    expect(g.petHappy()).toBe(true);
    g.feedPet();
    expect(toasts.at(-1)).toBe('Buddy is full and happy');
    const exp = g.s.exp;
    g.petPet();
    g.petPet();
    expect(g.s.exp).toBe(exp + 1);
    g.doDig(0, 0);
    g.doPlant(0, 0, 'pepper');
    g.plot(0, 0)!.pest = 'crow';
    g.tick(10); // an "offline" tick does not count
    for (let i = 0; i < 5; i++) g.tick(4);
    expect(g.plot(0, 0)!.pest).toBe('crow');
    g.tick(4);
    expect(g.plot(0, 0)!.pest).toBeNull();
    advance(9);
    expect(g.petHappy()).toBe(false);
  });

  it('cannot feed without coins', () => {
    const { g } = setup((s) => { s.gold = 0; });
    g.feedPet();
    expect(g.petHappy()).toBe(false);
  });
});

describe('Game: misc', () => {
  it('shop lists exclude gift-only and craft-only items', () => {
    const { g } = setup();
    const l = g.shopLists();
    expect(l.TREES.some((t) => t.giftOnly)).toBe(false);
    expect(l.DECOR.some((d) => d.craftOnly)).toBe(false);
    expect(l.BUILDINGS.some((b) => b.id === 'greenhouse')).toBe(false);
    expect(l.ANIMALS.length + l.CROPS.length).toBeGreaterThan(40);
  });

  it('objectAt on an empty cell and an object without readyAt', () => {
    const { g } = setup();
    expect(g.objectAt(4, 4)).toBeUndefined();
    const deco: FarmObject = { id: 1, key: 'decor:gnome', x: 0, y: 0, w: 1, h: 1, flip: false };
    expect(g.objectReady(deco)).toBe(false);
    expect(g.cropStage({ state: 'soil', growth: 0, watered: false, fertilized: false, pest: null })).toBe(-1);
    expect(g.timeLeft({ state: 'soil', growth: 0, watered: false, fertilized: false, pest: null })).toBe(0);
  });

  it('round2', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('Game: sound events', () => {
  it('asks for a sound on every audible action', () => {
    const { g } = setup((s) => { s.exp = 1e6; s.gold = 1e6; s.cellar = { radish: 3, wood: 5, straw: 5 }; s.pet.fedAt = 0; });
    const heard: string[] = [];
    g.on('sound', (n) => heard.push(n));
    g.place('animal:cow', 0, 0, false);
    g.place('tree:apple', 3, 0, false);
    g.place('building:workshop', 4, 3, false);
    expect(heard).toEqual(['place', 'place', 'place']);
    g.sell('radish', 1);
    g.sellAll((id) => id === 'radish');
    g.buyMaterial('wood');
    const [cow, apple, shop] = g.s.objects.slice(-3);
    cow.readyAt = 0; apple.readyAt = 0;
    g.doHarvestObject(cow);
    g.doHarvestObject(apple);
    g.startJob(shop, 'r_scarecrow');
    shop.jobs![0].endsAt = 0;
    g.collectJobs(shop);
    g.feedPet();
    g.s.pet.pettedAt = 0;
    g.petPet();
    g.s.gifts = [{ from: 'Emma', key: 'item:wood', npc: true }];
    g.acceptGift(0);
    g.expand('gold');
    expect(heard.slice(3)).toEqual(['coin', 'coin', 'coin', 'animal:cow', 'harvest', 'hammer', 'harvest', 'bark', 'bark', 'sparkle', 'levelup']);
  });
});

describe('Game: pet name', () => {
  it('a real dog name by default, chosen once, checked', () => {
    const { g, toasts } = setup();
    expect(g.s.pet.name).toBe('Buddy');
    expect(g.renamePet('  ')).toBe(false);
    expect(toasts.at(-1)).toContain('2 to 16 letters');
    expect(g.renamePet('1Rex')).toBe(false);
    expect(g.renamePet('A'.repeat(17))).toBe(false);
    expect(g.renamePet('  Lord   Byron ')).toBe(true);
    expect(g.s.pet).toMatchObject({ name: 'Lord Byron', renamed: true });
    expect(toasts.at(-1)).toBe('Your pet is now called Lord Byron!');
    expect(g.renamePet('Rex')).toBe(false);
    expect(toasts.at(-1)).toBe('The name has already been chosen');
    expect(g.s.pet.name).toBe('Lord Byron');
    for (const ok of ["D'Artagnan", 'Jean-Luc', 'Gümüş', 'Çiçək']) expect(PET_NAME_RE.test(ok)).toBe(true);
  });

  it('old saves: "Kukusik" becomes a real name, a chosen name stays', () => {
    for (const old of LEGACY_PET_NAMES) {
      const s = newState();
      s.pet.name = old;
      expect(new Game(s).s.pet.name).toBe('Buddy');
    }
    const kept = newState();
    kept.pet = { ...kept.pet, name: 'Kukusik', renamed: true }; // the player chose it on purpose
    expect(new Game(kept).s.pet.name).toBe('Kukusik');
  });
});
