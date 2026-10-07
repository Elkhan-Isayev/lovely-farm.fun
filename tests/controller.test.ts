import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/game';
import { expForLevel } from '../src/core/levels';
import { NPCS } from '../src/core/neighbors';
import { HOUR, key, newState, type FarmObject } from '../src/core/state';
import { cellCenter, iso } from '../src/render/iso';
import { PET_POS, Renderer } from '../src/render/renderer';
import { Controller, type Callbacks } from '../src/ui/controller';

let g: Game;
let r: Renderer;
let c: Controller;
let cb: { [K in keyof Callbacks]: ReturnType<typeof vi.fn> };
let toasts: string[];

beforeEach(() => {
  const s = newState();
  s.plots = {};
  s.objects = [];
  s.cellar = {};
  s.gold = 1000;
  g = new Game(s);
  toasts = [];
  g.on('toast', (x) => toasts.push(x.text));
  r = new Renderer(document.getElementById('world') as HTMLCanvasElement, g);
  r.resize(1000, 700, 1);
  r.centerOn(8);
  cb = { openBuilding: vi.fn(), openPet: vi.fn(), openHouse: vi.fn(), openSeeds: vi.fn() };
  c = new Controller(g, r, cb as unknown as Callbacks);
});

/** Screen point of a cell centre. */
const at = (x: number, y: number) => { const p = cellCenter(x, y); return r.toScreen(p.x, p.y); };
const click = (x: number, y: number) => { r.render(0, 0); const p = at(x, y); c.click(p.x, p.y); };
const work = () => { for (let i = 0; i < 400 && r.farmer.busy(); i++) r.farmer.update(0.05); };

describe('tool controller', () => {
  it('switching tools shows the grid and notifies the UI', () => {
    const changed = vi.fn();
    c.onChange(changed);
    c.setTool('shovel');
    expect(r.showGrid).toBe(true);
    c.setSeed('tomato');
    expect(c.tool).toBe('seed');
    expect(c.seed).toBe('tomato');
    c.cancel();
    expect(c.tool).toBe('hand');
    expect(r.showGrid).toBe(false);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('shovel digs grass for 10 coins (charged up front); a repeated click does not duplicate', () => {
    c.setTool('shovel');
    click(1, 1);
    click(1, 1);
    expect(g.s.gold).toBe(990);
    expect(g.pending.has(key(1, 1))).toBe(true);
    work();
    expect(g.plot(1, 1)!.state).toBe('soil');
    expect(g.pending.size).toBe(0);
    click(1, 1);
    expect(toasts.at(-1)).toBe('Already dug here');
  });

  it('cancelling tasks refunds the money', () => {
    c.setTool('shovel');
    click(2, 2);
    c.setSeed('radish');
    g.doDig(3, 3);
    click(3, 3);
    expect(g.s.gold).toBe(1000 - 10 - 10);
    r.farmer.clear();
    expect(g.s.gold).toBe(1000);
    expect(g.pending.size).toBe(0);
  });

  it('seeds: plant on soil; on grass dig and plant; errors are shown', () => {
    g.doDig(1, 1);
    c.setSeed('radish');
    click(1, 1);
    click(2, 2);
    work();
    expect(g.plot(1, 1)!.crop).toBe('radish');
    expect(g.plot(2, 2)!.crop).toBe('radish');
    expect(g.s.gold).toBe(1000 - 10 - 10 - 10);
    c.setSeed('gerbera');
    g.doDig(4, 4);
    click(4, 4);
    expect(toasts.at(-1)).toBe('Requires level 35');
    c.setSeed('radish');
    click(20, 20);
    expect(toasts.at(-1)).toBe('Dig the bed first');
  });

  it('hand: chase a pest, harvest, water, open seeds, clear withered', () => {
    g.doDig(1, 1); g.doPlant(1, 1, 'radish'); g.plot(1, 1)!.pest = 'crow';
    g.doDig(2, 2); g.doPlant(2, 2, 'radish'); g.plot(2, 2)!.growth = 4 * HOUR;
    g.doDig(3, 3); g.doPlant(3, 3, 'radish');
    g.doDig(4, 4);
    g.doDig(5, 5); g.doPlant(5, 5, 'radish'); g.plot(5, 5)!.state = 'withered';
    g.doDig(6, 6); g.doPlant(6, 6, 'radish'); g.plot(6, 6)!.watered = true;
    for (const [x, y] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 0]]) click(x, y);
    work();
    expect(g.plot(1, 1)!.pest).toBeNull();
    expect(g.s.cellar.radish).toBe(1);
    expect(g.plot(3, 3)!.watered).toBe(true);
    expect(cb.openSeeds).toHaveBeenCalled();
    expect(g.plot(5, 5)!.state).toBe('soil');
  });

  it('watering can and fertilizer', () => {
    g.doDig(1, 1); g.doPlant(1, 1, 'pepper');
    g.doDig(2, 2); g.doPlant(2, 2, 'pepper'); g.plot(2, 2)!.pest = 'toad';
    c.setTool('fertilize');
    click(1, 1);
    expect(toasts.at(-1)).toBe('Water the bed first');
    c.setTool('water');
    click(1, 1);
    click(2, 2);
    click(5, 5);
    work();
    expect(g.plot(1, 1)!.watered).toBe(true);
    expect(g.plot(2, 2)!.pest).toBeNull();
    c.setTool('fertilize');
    click(1, 1);
    click(6, 6);
    work();
    expect(g.plot(1, 1)!.fertilized).toBe(true);
  });

  it('hand on objects: harvest a tree, building, pet, house', () => {
    g.s.objects.push({ id: 1, key: 'tree:cherry', x: 3, y: 3, w: 1, h: 1, flip: false, readyAt: 0 });
    g.s.objects.push({ id: 2, key: 'building:mill', x: 6, y: 0, w: 2, h: 2, flip: false, jobs: [] });
    g.s.objects.push({ id: 3, key: 'tree:apple', x: 0, y: 5, w: 1, h: 1, flip: false, readyAt: Infinity });
    g.rebuildOcc();
    click(3, 3);
    click(3, 3);
    click(0, 5);
    work();
    expect(g.s.cellar.t_cherry).toBe(1);
    click(7, 1);
    expect(cb.openBuilding).toHaveBeenCalledWith(g.s.objects[1]);
    r.render(0, 0);
    const pet = iso(PET_POS.x, PET_POS.y);
    const ps = r.toScreen(pet.x, pet.y - 10);
    c.click(ps.x, ps.y);
    expect(cb.openPet).toHaveBeenCalled();
    const house = iso(-1, -1);
    const hs = r.toScreen(house.x - 60, house.y - 30);
    c.click(hs.x, hs.y);
    expect(cb.openHouse).toHaveBeenCalled();
  });

  it('placing from the shop: ghost, repeat, stop after a building', () => {
    g.s.gold = 100_000;
    g.s.exp = expForLevel(10);
    c.startPlacing('tree:cherry', false);
    let p = at(1, 1);
    c.hover(p.x, p.y);
    expect(r.ghost).toMatchObject({ x: 1, y: 1, valid: true });
    c.click(p.x, p.y);
    expect(g.objectAt(1, 1)?.key).toBe('tree:cherry');
    expect(c.tool).toBe('place');
    c.hover(p.x, p.y);
    expect(r.ghost!.valid).toBe(false);
    c.click(p.x, p.y);
    c.startPlacing('building:mill', false);
    p = at(4, 4);
    c.hover(p.x, p.y);
    c.click(p.x, p.y);
    expect(c.tool).toBe('hand');
    expect(r.ghost).toBeNull();
  });

  it('placing from storage stops when items run out', () => {
    g.s.storage['animal:pig'] = 1;
    c.startPlacing('animal:pig', true);
    const p = at(2, 2);
    c.hover(p.x, p.y);
    c.click(p.x, p.y);
    expect(c.tool).toBe('hand');
    c.tool = 'place';
    c.placing = null;
    c.click(p.x, p.y);
  });

  it('moving and storing objects', () => {
    g.s.objects.push({ id: 5, key: 'decor:gnome', x: 2, y: 2, w: 1, h: 1, flip: false });
    g.rebuildOcc();
    c.setTool('move');
    r.render(0, 0);
    const from = r.toScreen(cellCenter(2, 2).x, cellCenter(2, 2).y - 10);
    c.click(at(6, 6).x, at(6, 6).y); // empty: nothing is picked up
    expect(c.moving).toBeNull();
    c.click(from.x, from.y);
    expect(c.moving?.id).toBe(5);
    const to = at(5, 1);
    c.hover(to.x, to.y);
    c.click(to.x, to.y);
    expect(g.objectAt(5, 1)?.id).toBe(5);
    expect(c.moving).toBeNull();
    c.setTool('store');
    r.render(0, 0);
    c.click(at(7, 7).x, at(7, 7).y);
    const gnome = r.toScreen(cellCenter(5, 1).x, cellCenter(5, 1).y - 10);
    c.click(gnome.x, gnome.y);
    expect(g.s.storage['decor:gnome']).toBe(1);
  });

  it('on a visit a click helps the neighbour (or reports the limit)', async () => {
    g.startVisit({ type: 'npc', npc: NPCS[2] });
    const target = Object.entries(g.visit!.farm.plots).find(([, p]) => p.pest || !p.watered)!;
    const [x, y] = target[0].split(',').map(Number);
    click(0, 0); // not a bed: nothing happens
    click(x, y);
    work();
    await Promise.resolve();
    expect(g.s.stats.helped).toBe(1);
    g.s.help[NPCS[2].id].cells = ['a', 'b', 'c', 'd', 'e'];
    const other = Object.entries(g.visit!.farm.plots).find(([k, p]) => k !== target[0] && (p.pest || !p.watered))!;
    const [x2, y2] = other[0].split(',').map(Number);
    click(x2, y2);
    expect(toasts.at(-1)).toBe('You\'ve helped this neighbour enough for today');
  });

  it('hover without placement clears the ghost; cannot place while visiting', () => {
    c.hover(100, 100);
    expect(r.ghost).toBeNull();
    expect(r.hover).not.toBeNull();
    c.startPlacing('tree:cherry', false);
    g.startVisit({ type: 'npc', npc: NPCS[1] });
    c.hover(at(1, 1).x, at(1, 1).y);
    expect(r.ghost!.valid).toBe(false);
  });

  it('seeds on grass without money for digging and planting show a message', () => {
    g.s.gold = 15;
    c.setSeed('radish');
    click(1, 1);
    expect(toasts.at(-1)).toBe('Dig the bed first');
    const obj: FarmObject = { id: 9, key: 'decor:gnome', x: 3, y: 3, w: 1, h: 1, flip: false };
    g.s.objects.push(obj);
    g.rebuildOcc();
    c.setTool('shovel');
    click(3, 3);
    expect(toasts.at(-1)).toBe('This spot is taken');
  });

  it('cancelling dig-and-plant on grass refunds both amounts', () => {
    c.setSeed('tomato');
    click(1, 1);
    expect(g.s.gold).toBe(1000 - 10 - 20);
    r.farmer.clear();
    expect(g.s.gold).toBe(1000);
  });
});
