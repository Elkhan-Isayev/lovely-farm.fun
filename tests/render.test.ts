import { describe, expect, it, vi } from 'vitest';
import { ANIMALS, BUILDINGS, CROPS, DECOR, TREES } from '../src/data/items';
import { Game } from '../src/core/game';
import { HOUR, newState, type FarmObject, type Plot } from '../src/core/state';
import { NPCS } from '../src/core/neighbors';
import { TH, TW, cellCenter, diamond, iso, unIso } from '../src/render/iso';
import {
  buildingSprite, cropIconURL, cropSprite, drawBox, drawSprite, emojiSprite, houseSprite, shade, sprite, treeIconURL, treeSprite,
} from '../src/render/sprites';
import { ART } from '../src/render/artManifest';
import { Farmer, type Tool } from '../src/render/farmer';
import { PET_POS, Renderer, clamp, isReady, plotStage, readyIcon } from '../src/render/renderer';
import { fakeContext, type FakeCtx } from './setup';

const plot = (p: Partial<Plot>): Plot => ({ state: 'growing', crop: 'radish', growth: 0, watered: false, fertilized: false, pest: null, ...p });

describe('isometry', () => {
  it('cell ↔ screen', () => {
    expect(iso(1, 0)).toEqual({ x: TW / 2, y: TH / 2 });
    expect(cellCenter(0, 0)).toEqual({ x: 0, y: TH / 2 });
    const back = unIso(iso(3.25, 5.5).x, iso(3.25, 5.5).y);
    expect(back.x).toBeCloseTo(3.25);
    expect(back.y).toBeCloseTo(5.5);
  });

  it('cell diamond', () => {
    const ctx = fakeContext();
    diamond(ctx, 0, 0, 2, 3);
    expect(ctx.calls).toEqual(['beginPath', 'moveTo', 'lineTo', 'lineTo', 'lineTo', 'closePath']);
  });
});

describe('sprites', () => {
  it('are cached by key', () => {
    const draw = vi.fn();
    const a = sprite('test:x', 10, 10, 5, 5, draw);
    const b = sprite('test:x', 10, 10, 5, 5, draw);
    expect(a).toBe(b);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(a.canvas.width).toBe(20);
  });

  it.each(CROPS.map((c) => c.id))('crop %s renders at every stage', (id) => {
    for (let st = 0; st <= 5; st++) {
      const s = cropSprite(id, st);
      expect(s.w).toBeGreaterThan(0);
      expect((s.canvas.getContext('2d') as unknown as FakeCtx).calls.length).toBeGreaterThan(0);
    }
  });

  it.each(TREES.map((t) => t.id))('tree %s with and without fruit', (id) => {
    expect(treeSprite(id, true)).not.toBe(treeSprite(id, false));
  });

  it('buildings, greenhouse, house, emoji, box', () => {
    for (const b of BUILDINGS) expect(buildingSprite(b.id, b.w, b.h, b.wall, b.roof).h).toBeGreaterThan(100);
    expect(houseSprite()).toBe(houseSprite());
    expect(emojiSprite('🐄', 30).w).toBeCloseTo(42);
    const ctx = fakeContext();
    const tall = drawBox(ctx, 1, 3, 20, '#aa8844', '#884422');
    expect(tall.L).toBeDefined();
    drawBox(ctx, 2, 2, 20, '#aa8844', '#aa8844', { glass: true });
  });

  it('UI icons: the painted picture, or a rendered sprite without one', () => {
    expect(cropIconURL('radish')).toBe('/art/crop-radish.webp');
    expect(treeIconURL('plum')).toBe('/art/tree-plum.webp');
    const saved = { crop: ART['crop-radish'], tree: ART['tree-plum'] };
    delete ART['crop-radish'];
    delete ART['tree-plum'];
    try {
      expect(cropIconURL('radish')).toMatch(/^data:image/);
      expect(cropIconURL('radish')).toBe(cropIconURL('radish'));
      expect(treeIconURL('plum')).toMatch(/^data:image/);
      expect(treeIconURL('plum')).toBe(treeIconURL('plum'));
    } finally {
      ART['crop-radish'] = saved.crop;
      ART['tree-plum'] = saved.tree;
    }
  });

  it('colour shades', () => {
    expect(shade('#808080', 0)).toBe('rgb(128,128,128)');
    expect(shade('#000000', 1)).toBe('rgb(255,255,255)');
    expect(shade('#ffffff', -1)).toBe('rgb(0,0,0)');
  });

  it('draws flipped and translucent', () => {
    const ctx = fakeContext();
    const s = emojiSprite('🐔', 20);
    drawSprite(ctx, s, 0, 0, true, 0.5);
    expect(ctx.calls).toEqual(['save', 'translate', 'scale', 'drawImage', 'restore']);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('farmer', () => {
  it('walks to the cell, works and runs the task; queue and cancel', () => {
    const f = new Farmer(0, 0);
    const run = vi.fn(), cancel = vi.fn(), idle = vi.fn();
    f.onIdle = idle;
    f.update(0.1);
    expect(f.busy()).toBe(false);
    f.add({ x: 3, y: 0, tool: 'shovel', key: '3,0', run });
    f.add({ x: 4, y: 0, tool: 'water', key: '4,0', run: vi.fn(), cancel });
    expect(f.busy()).toBe(true);
    for (let i = 0; i < 40 && !run.mock.calls.length; i++) f.update(0.05);
    expect(run).toHaveBeenCalled();
    expect(f.x).toBeCloseTo(3.15);
    expect(idle).not.toHaveBeenCalled();
    f.clear();
    expect(cancel).toHaveBeenCalled();
    expect(f.busy()).toBe(false);
    expect(f.depth()).toBeCloseTo(f.x + f.y);
  });

  it('faces the walking direction and hurries with a long queue', () => {
    const f = new Farmer(5, 0);
    for (let i = 0; i < 8; i++) f.add({ x: 0, y: 5, tool: 'basket', key: `k${i}`, run: () => {} });
    f.update(0.05);
    expect(f.facing).toBe(-1);
    expect(f.walk).toBeGreaterThan(0);
  });

  it('calls onIdle after the last task', () => {
    const f = new Farmer(0.15, 0.92);
    const idle = vi.fn();
    f.onIdle = idle;
    f.add({ x: 0, y: 0, tool: 'seeds', key: 'a', run: () => {} });
    for (let i = 0; i < 20; i++) f.update(0.05);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it.each<[Tool | undefined, 'boy' | 'girl']>([
    ['shovel', 'boy'], ['hammer', 'girl'], ['water', 'boy'], ['fertilizer', 'girl'], ['seeds', 'boy'], ['basket', 'girl'], ['shoo', 'boy'], [undefined, 'girl'],
  ])('renders with tool %s (%s)', (tool, gender) => {
    const f = new Farmer(0, 0);
    if (tool) {
      f.add({ x: 0, y: 0, tool, key: 'k', run: () => {} });
      f.x = 0.15; f.y = 0.92;
      f.update(0.3);
    } else f.walk = 1;
    const ctx = fakeContext();
    f.draw(ctx, { gender, hair: '#3a2416', shirt: '#ffffff', pants: '#336633' }, 1);
    expect(ctx.calls.length).toBeGreaterThan(30);
  });
});

function makeRenderer(mod?: (g: Game) => void) {
  const s = newState();
  const g = new Game(s);
  mod?.(g);
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const r = new Renderer(canvas, g);
  r.resize(1000, 700, 2);
  r.centerOn(g.s.size);
  return { g, r, ctx: canvas.getContext('2d') as unknown as FakeCtx };
}

describe('renderer', () => {
  it('bed stages, object readiness, icons', () => {
    expect(plotStage(plot({ state: 'soil', crop: undefined }))).toBe(-1);
    expect(plotStage(plot({ state: 'withered', growth: -1 }))).toBe(5);
    expect(plotStage(plot({ state: 'withered', growth: 5 }))).toBe(4);
    expect(plotStage(plot({ growth: 0 }))).toBe(0);
    expect(plotStage(plot({ growth: 1 * HOUR }))).toBe(1);
    expect(plotStage(plot({ growth: 3 * HOUR }))).toBe(2);
    expect(plotStage(plot({ growth: 4 * HOUR }))).toBe(3);
    const o = (key: string, extra: Partial<FarmObject> = {}): FarmObject => ({ id: 1, key, x: 0, y: 0, w: 1, h: 1, flip: false, ...extra });
    expect(isReady(o('tree:apple', { readyAt: 5 }), 10)).toBe(true);
    expect(isReady(o('decor:gnome'), 10)).toBe(false);
    expect(isReady(o('building:mill', { jobs: [{ recipe: 'cornflour', startsAt: 0, endsAt: 5 }] }), 10)).toBe(true);
    expect(isReady(o('building:greenhouse', { slots: [{ crop: 'radish', plantedAt: 0 }] }), 4 * HOUR)).toBe(true);
    expect(isReady(o('building:greenhouse', { slots: [{ crop: null, plantedAt: 0 }] }), 4 * HOUR)).toBe(false);
    expect(readyIcon(o('animal:cow'))).toBe('🥛');
    expect(readyIcon(o('tree:apple'))).toBe('🍎');
    expect(readyIcon(o('tree:plum'))).toBe('🧺');
    expect(readyIcon(o('building:mill'))).toBe('✅');
    expect(clamp(5, 0, 3)).toBe(3);
  });

  it('renders a whole farm with everything on it', () => {
    const { g, r, ctx } = makeRenderer((g) => {
      g.s.size = 18;
      let x = 0;
      const put = (key: string, w = 1, h = 1, extra: Partial<FarmObject> = {}) => {
        g.s.objects.push({ id: g.s.nextId++, key, x, y: 10, w, h, flip: x % 2 === 0, readyAt: x % 2 ? 0 : Infinity, ...extra });
        x += w;
        if (x > 15) x = 0;
      };
      for (const d of DECOR) put('decor:' + d.id, d.size, d.size);
      for (const a of ANIMALS.slice(0, 4)) put('animal:' + a.id, a.size, a.size);
      for (const t of TREES.slice(0, 4)) put('tree:' + t.id);
      put('building:mill', 2, 2, { jobs: [{ recipe: 'cornflour', startsAt: 0, endsAt: Date.now() + HOUR }] });
      put('building:greenhouse', 2, 3, { slots: [{ crop: 'radish', plantedAt: 0 }, { crop: 'tomato', plantedAt: Date.now() }, { crop: null, plantedAt: 0 }] });
      g.s.plots['1,1'] = plot({ pest: 'crow' });
      g.s.plots['2,1'] = plot({ pest: 'toad' });
      g.s.plots['3,1'] = plot({ watered: false });
      g.s.plots['4,1'] = plot({ state: 'withered', growth: -1 });
      g.s.plots['5,1'] = plot({ state: 'soil', crop: undefined });
      g.s.plots['30,30'] = plot({}); // out of bounds: skipped
      g.s.pet.fedAt = g.now();
    });
    r.showGrid = true;
    r.hover = { x: 2, y: 2 };
    r.ghost = { key: 'tree:apple', x: 4, y: 4, w: 1, h: 1, valid: false };
    g.pending.add('6,6');
    r.addFloat(1, 1, '+5', '#fff', '⭐');
    r.addFloat(1, 1, 'test', '#fff');
    r.render(1, 0.016);
    expect(ctx.calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(50);
    expect(r.pick(-9999, -9999)).toBeNull();
    // hungry pet, no grid
    g.s.pet.fedAt = 0;
    r.showGrid = false;
    r.ghost = { key: 'tree:apple', x: 4, y: 4, w: 1, h: 1, valid: true };
    r.render(2, 0.016);
  });

  it('floating labels live ~1.7 seconds', () => {
    const { r } = makeRenderer();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    r.addFloat(0, 0, 'a', '#fff');
    r.render(0, 0);
    expect(r.floats).toHaveLength(1);
    now.mockReturnValue(1000 + 1600);
    r.render(0, 0);
    now.mockReturnValue(1000 + 1800);
    r.render(0, 0);
    expect(r.floats).toHaveLength(0);
  });

  it('camera: coordinate conversion, zoom around a point, pan', () => {
    const { r } = makeRenderer();
    const w = r.toWorld(300, 200);
    const s = r.toScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
    const before = r.toWorld(500, 350);
    r.zoomAt(500, 350, 1.5);
    const after = r.toWorld(500, 350);
    expect(after.x).toBeCloseTo(before.x);
    r.zoomAt(0, 0, 100);
    expect(r.cam.zoom).toBe(2.2);
    const cx = r.cam.x;
    r.pan(22, 0);
    expect(r.cam.x).toBeCloseTo(cx - 10);
    const c = iso(2.5, 3.5);
    const sc = r.toScreen(c.x, c.y);
    expect(r.cellAt(sc.x, sc.y)).toEqual({ x: 2, y: 3 });
  });

  it('picks objects by click: tree, pet, house', () => {
    const { g, r } = makeRenderer((g) => { g.s.objects = [{ id: 1, key: 'tree:cherry', x: 3, y: 3, w: 1, h: 1, flip: false, readyAt: 0 }]; });
    r.render(0, 0);
    const tree = iso(3.5, 3.5);
    const ts = r.toScreen(tree.x, tree.y - 50);
    expect(r.pick(ts.x, ts.y)).toBe(g.s.objects[0]);
    const pet = iso(PET_POS.x, PET_POS.y);
    const ps = r.toScreen(pet.x, pet.y - 10);
    expect(r.pick(ps.x, ps.y)).toBe('pet');
    const house = iso(-1, -1);
    const hs = r.toScreen(house.x - 60, house.y - 30);
    expect(r.pick(hs.x, hs.y)).toBe('house');
  });

  it('renders a neighbour farm in real time while visiting', () => {
    const { g, r } = makeRenderer();
    g.startVisit({ type: 'npc', npc: NPCS[30] });
    const v = r.view();
    expect(v.own).toBe(false);
    expect(v.size).toBe(g.visit!.farm.size);
    r.render(0, 0.016);
    g.endVisit();
    expect(r.view().own).toBe(true);
  });

  it('game floats reach the renderer; labels in one cell are staggered', () => {
    const { g, r } = makeRenderer();
    g.float(1, 1, '+1');
    g.float(1, 1, '+2');
    expect(r.floats).toHaveLength(2);
    expect(r.floats[1].t0).toBeGreaterThan(r.floats[0].t0);
  });
});

describe('camera limits', () => {
  it('cannot be dragged or zoomed away from the farm', () => {
    const { g, r } = makeRenderer();
    for (let i = 0; i < 50; i++) r.pan(5000, 0);
    const half = (g.s.size * TW) / 2;
    expect(r.cam.x).toBe(-half - 160);
    for (let i = 0; i < 50; i++) r.pan(-5000, -5000);
    expect(r.cam.x).toBe(half + 160);
    expect(r.cam.y).toBe(g.s.size * TH + 160);
    r.pan(0, 1e6);
    expect(r.cam.y).toBe(-300);
    r.zoomAt(0, 0, 0.1);
    expect(Math.abs(r.cam.x)).toBeLessThanOrEqual(half + 160);
  });
});
