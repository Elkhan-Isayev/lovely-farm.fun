// Painted sprites: the manifest matches the files and the game content, the loader, and rendering with pictures.
import { existsSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANIMALS, BUILDINGS, CROPS, DECOR, TREES } from '../src/data/items';
import { Game } from '../src/core/game';
import { HOUR, newState, type FarmObject, type Plot } from '../src/core/state';
import { ART } from '../src/render/artManifest';
import { art, artFit, artURL, hasArt, setArt } from '../src/render/art';
import { groundMatrix, MILL_HUB, Renderer } from '../src/render/renderer';
import { artSprite, cropSprite, treeSprite } from '../src/render/sprites';
import { FRAMES, Farmer, farmerAtlas, farmerFrame, type Tool } from '../src/render/farmer';
import { fakeContext, type FakeCtx } from './setup';

const plot = (p: Partial<Plot>): Plot => ({ state: 'growing', crop: 'radish', growth: 0, watered: false, fertilized: false, pest: null, ...p });

/** An "image" the fake canvas context accepts; only its size matters. */
function fakeImage(w: number, h: number): HTMLImageElement {
  const img = document.createElement('img');
  img.width = w;
  img.height = h;
  return img;
}

describe('art manifest', () => {
  it('has a picture for every crop, tree, animal, decoration and building', () => {
    const need = [
      ...CROPS.map((c) => `crop-${c.id}`),
      ...CROPS.filter((c) => c.id !== 'gerbera').map((c) => `crop-${c.id}-young`), // the gerbera borrows the chamomile's
      ...TREES.flatMap((t) => [`tree-${t.id}`, `tree-${t.id}-bare`]),
      ...ANIMALS.map((a) => `animal-${a.id}`),
      ...DECOR.filter((d) => d.id !== 'path').map((d) => `decor-${d.id}`),
      ...BUILDINGS.map((b) => `bld-${b.id}`),
      'farmer-boy', 'farmer-girl', ...['boy', 'girl'].flatMap((g) => ['hair', 'shirt', 'pants'].map((r) => `farmer-${g}-${r}`)),
      'house', 'mill-sails', 'kennel', 'dog', 'crow', 'toad', 'sprout', 'withered', 'stubble',
      'tex-grass', 'tex-soil', 'tex-path', 'backdrop',
    ];
    expect(need.filter((id) => !hasArt(id))).toEqual([]);
  });

  it('lists exactly the files in public/art', () => {
    const files = readdirSync('public/art').filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
    expect(Object.keys(ART).sort()).toEqual(files);
    for (const [w, h] of Object.values(ART)) expect(w > 0 && h > 0 && w <= 1800 && h <= 800).toBe(true);
    expect(existsSync('art/sheets')).toBe(true); // the source sheets stay in the repository
  });

  it('URLs and fitting into a box', () => {
    expect(artURL('crow')).toBe('/art/crow.webp');
    expect(artURL('nope')).toBe('');
    const [w, h] = ART['house'];
    const fit = artFit('house', 100, 100);
    expect(Math.max(fit.w, fit.h)).toBeCloseTo(100);
    expect(fit.w / fit.h).toBeCloseTo(w / h);
  });
});

describe('art loader', () => {
  it('downloads in the background, keeps the fallback on errors, preloads everything', async () => {
    vi.resetModules();
    const created: string[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private s = '';
      get src() { return this.s; }
      set src(v: string) {
        this.s = v;
        created.push(v);
        queueMicrotask(() => (v === '/art/crow.webp' ? this.onerror : this.onload)?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const mod = await import('../src/render/art');
      expect(mod.art('dog')).toBeNull(); // not loaded yet, the download starts
      expect(mod.art('dog')).toBeNull(); // and is not started twice
      expect(created).toEqual(['/art/dog.webp']);
      await new Promise((r) => setTimeout(r, 0));
      expect(mod.art('dog')).toBeInstanceOf(FakeImage);
      expect(mod.art('nope')).toBeNull();
      await mod.preloadArt();
      expect(created).toHaveLength(Object.keys(ART).length);
      expect(mod.art('crow')).toBeNull(); // failed: stays procedural, no retries
      expect(created.filter((u) => u === '/art/crow.webp')).toHaveLength(1);
      expect(mod.art('house')).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('painted farmer', () => {
  it('picks a frame for walking, standing and both phases of every tool', () => {
    expect(farmerFrame(undefined, 0, 0)).toBe(FRAMES.idle);
    expect([0.1, 1.7, 3.3, 4.9, 6.5].map((w) => farmerFrame(undefined, 0, w))).toEqual([1, 2, 3, 2, 1]);
    const phases = (tool: Tool) => [farmerFrame(tool, 0.1, 0), farmerFrame(tool, 0.9, 0)];
    expect(phases('shovel')).toEqual([FRAMES.digUp, FRAMES.digDown]);
    expect(phases('water')).toEqual([FRAMES.canUp, FRAMES.canPour]);
    expect(phases('seeds')).toEqual([FRAMES.sow, FRAMES.sow]);
    expect(phases('basket')).toEqual([FRAMES.pick, FRAMES.basket]);
    expect(phases('fertilizer')).toEqual([FRAMES.fertilize, FRAMES.fertilize]);
    expect(phases('hammer')).toEqual([FRAMES.hammerUp, FRAMES.hammerDown]);
    expect([0.1, 0.3].map((t) => farmerFrame('shoo', t, 0))).toEqual([FRAMES.shooA, FRAMES.shooB]);
  });

  it('is recoloured to the look once, and falls back to code while loading', () => {
    const look = { gender: 'boy' as const, hair: '#111111', shirt: '#222222', pants: '#333333' };
    expect(farmerAtlas(look)).toBeNull();
    const f = new Farmer(1, 1);
    const ctx = fakeContext();
    f.draw(ctx, look, 0);
    expect(ctx.calls.filter((c) => c === 'drawImage')).toHaveLength(0); // procedural
    for (const id of ['farmer-boy', 'farmer-boy-hair', 'farmer-boy-shirt', 'farmer-boy-pants']) setArt(id, fakeImage(...ART[id]));
    try {
      const atlas = farmerAtlas(look)!;
      expect(atlas.width).toBe(ART['farmer-boy'][0]);
      expect(farmerAtlas(look)).toBe(atlas);
      expect(farmerAtlas({ ...look, shirt: '#444444' })).not.toBe(atlas);
      const actx = atlas.getContext('2d') as unknown as FakeCtx;
      expect(actx.calls.filter((c) => c === 'drawImage')).toHaveLength(4); // base + 3 coloured masks
      const draw = fakeContext();
      f.add({ x: 1, y: 1, tool: 'water', key: 'k', run: () => {} });
      f.x = 1.15; f.y = 1.92;
      f.update(0.3);
      f.draw(draw, look, 1);
      f.walk = 2;
      f.cur = null;
      f.facing = -1;
      f.draw(draw, look, 1);
      expect(draw.calls.filter((c) => c === 'drawImage')).toHaveLength(2);
    } finally {
      for (const id of ['farmer-boy', 'farmer-boy-hair', 'farmer-boy-shirt', 'farmer-boy-pants']) setArt(id, null);
    }
  });
});

describe('with painted pictures loaded', () => {
  beforeAll(() => { for (const [id, [w, h]] of Object.entries(ART)) setArt(id, fakeImage(w, h)); });
  afterAll(() => { for (const id of Object.keys(ART)) setArt(id, null); });

  it('crops use the pictures at every stage but seeds', () => {
    expect(cropSprite('radish', 3)).toBe(artSprite('crop-radish', 54, 66, 0.95));
    expect(cropSprite('radish', 2)).toBe(artSprite('crop-radish-young', 40, 46, 0.95));
    expect(cropSprite('gerbera', 2)).toBe(artSprite('crop-chamomile-young', 40, 46, 0.95));
    expect(cropSprite('radish', 1)).toBe(artSprite('sprout', 20, 18, 0.95));
    expect(cropSprite('radish', 4)).toBe(artSprite('withered', 38, 44, 0.95));
    expect(cropSprite('radish', 5)).toBe(artSprite('stubble', 34, 26, 0.9));
    expect(cropSprite('radish', 0).w).toBe(64); // seeds stay procedural
    const ripe = cropSprite('tomato', 3);
    expect(ripe.h).toBeLessThanOrEqual(66.001);
    expect(ripe.canvas.width).toBe(Math.ceil(ripe.w * 3)); // baked at 3×
    expect(artSprite('nope', 10, 10)).toBeNull();
  });

  it('trees switch pictures when they ripen, and only if both exist', () => {
    expect(treeSprite('apple', true)).toBe(artSprite('tree-apple', 84, 112, 0.97));
    expect(treeSprite('apple', false)).toBe(artSprite('tree-apple-bare', 84, 112, 0.97));
    setArt('tree-plum-bare', null);
    expect(treeSprite('plum', true).w).toBe(90); // procedural, so the style doesn't jump
    setArt('tree-plum-bare', fakeImage(...ART['tree-plum-bare']));
    expect(art('tree-plum-bare')).not.toBeNull();
  });

  it('ground textures lie flat on the isometric grid', () => {
    const m = groundMatrix(256, 1);
    // texture corner (256, 0) → the cell's right corner, (0, 256) → its left corner
    expect({ x: m.a * 256, y: m.b * 256 }).toEqual({ x: 32, y: 16 });
    expect({ x: m.c * 256, y: m.d * 256 }).toEqual({ x: -32, y: 16 });
    expect(MILL_HUB.x).toBeGreaterThan(0);
  });

  it('renders a whole farm with pictures', () => {
    const g = new Game(newState());
    g.s.size = 18;
    let x = 0;
    const put = (key: string, w = 1, h = 1, extra: Partial<FarmObject> = {}) => {
      g.s.objects.push({ id: g.s.nextId++, key, x, y: 10, w, h, flip: x % 2 === 0, readyAt: x % 2 ? 0 : Infinity, ...extra });
      x += w;
      if (x > 15) x = 0;
    };
    for (const d of DECOR) put('decor:' + d.id, d.size, d.size);
    for (const a of ANIMALS) put('animal:' + a.id, a.size, a.size);
    for (const t of TREES.slice(0, 4)) put('tree:' + t.id);
    for (const b of BUILDINGS) put('building:' + b.id, b.w, b.h, { jobs: [{ recipe: 'cornflour', startsAt: 0, endsAt: Date.now() + HOUR }] });
    g.s.plots['1,1'] = plot({ pest: 'crow' });
    g.s.plots['2,1'] = plot({ pest: 'toad' });
    g.s.plots['3,1'] = plot({ watered: true, growth: 3 * HOUR });
    g.s.plots['4,1'] = plot({ state: 'withered', growth: -1 });
    g.s.plots['5,1'] = plot({ state: 'soil', crop: undefined });
    const canvas = document.getElementById('world') as HTMLCanvasElement;
    const r = new Renderer(canvas, g);
    r.resize(1000, 700, 2);
    r.centerOn(g.s.size);
    const ctx = canvas.getContext('2d') as unknown as FakeCtx;
    ctx.calls.length = 0;
    r.render(1, 0.016);
    expect(ctx.calls.filter((c) => c === 'drawImage').length).toBeGreaterThan(80);
    expect(ctx.calls.filter((c) => c === 'createPattern')).toHaveLength(3); // grass, soil, path — once each
    expect(ctx.calls).toContain('transform'); // the sheared fence
    g.s.pet.fedAt = 0;
    r.render(2, 0.016);
    expect(ctx.calls.filter((c) => c === 'createPattern')).toHaveLength(3);
    // the procedural horizon forest is not drawn under the painted sky
    expect(ctx.calls.filter((c) => c === 'fillRect').length).toBeLessThan(40);
  });
});
