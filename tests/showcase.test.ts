// Showcase farms: three big "maxed out" farms every player can look at.
import { describe, expect, it } from 'vitest';
import { ANIMALS, BUILDINGS, cropById, placeInfo, treeById } from '../src/data/items';
import { Game } from '../src/core/game';
import { SHOWCASES, layout, showcaseById } from '../src/core/showcase';
import { HOUR, newState } from '../src/core/state';
import { plotStage } from '../src/render/renderer';
import { t } from '../src/i18n';

describe('showcase farms', () => {
  it.each(SHOWCASES.map((s) => s.id))('%s is big, full, ripe and has no overlaps', (id) => {
    const farm = showcaseById[id].build();
    expect(farm.size).toBe(24); // bigger than any player's farm (18)
    const cells = new Set<string>();
    for (const o of farm.objects) {
      const info = placeInfo(o.key);
      expect([o.w, o.h]).toEqual([info.w, info.h]);
      for (let x = o.x; x < o.x + o.w; x++) for (let y = o.y; y < o.y + o.h; y++) {
        expect(x >= 0 && y >= 0 && x < farm.size && y < farm.size).toBe(true);
        expect(cells.has(`${x},${y}`)).toBe(false);
        cells.add(`${x},${y}`);
      }
      if (info.kind === 'tree') expect(treeById[info.id]).toBeDefined();
    }
    for (const [k, p] of Object.entries(farm.plots)) {
      expect(cells.has(k)).toBe(false);
      cells.add(k);
      expect(cropById[p.crop!]).toBeDefined();
      expect(plotStage(p)).toBe(3); // everything is ripe
      expect(p.pest).toBeNull();
    }
    expect(cells.size).toBeGreaterThan(24 * 24 * 0.75); // densely decorated
    expect(Object.keys(farm.plots).length).toBeGreaterThan(80);
    expect(farm.objects.filter((o) => o.key.startsWith('tree:')).length).toBeGreaterThan(20);
    expect(farm.objects.filter((o) => o.key.startsWith('animal:') || o.key.startsWith('decor:') && o.key !== 'decor:path').length).toBeGreaterThan(15);
    // the same farm every time
    expect(showcaseById[id].build()).toEqual(farm);
  });

  it('each has its own style', () => {
    const keys = (id: 'estate' | 'blossom' | 'tropic') => new Set(showcaseById[id].build().objects.map((o) => o.key));
    const estate = keys('estate'), blossom = keys('blossom'), tropic = keys('tropic');
    for (const b of BUILDINGS) expect(estate.has('building:' + b.id)).toBe(true); // every building
    expect(blossom.has('decor:fountain_angel') && blossom.has('decor:topiary_heart') && blossom.has('decor:gazebo') && blossom.has('tree:birch')).toBe(true);
    expect(tropic.has('decor:ship') && tropic.has('decor:tiki') && tropic.has('tree:banana') && tropic.has('animal:lion')).toBe(true);
    expect(estate.has('decor:lamp') && estate.has('decor:fence_white')).toBe(true);
    expect([...estate].filter((k) => k.startsWith('animal:')).length).toBeGreaterThan(ANIMALS.length / 2);
    const gh = showcaseById.estate.build().objects.find((o) => o.key === 'building:greenhouse')!;
    expect(gh.slots!.every((s) => s.crop)).toBe(true);
  });

  it('layout refuses what does not fit', () => {
    const f = layout(4);
    expect(f.put('building:mill', 3, 3)).toBe(false); // sticks out
    expect(f.put('building:mill', 0, 0)).toBe(true);
    expect(f.put('tree:apple', 1, 1)).toBe(false); // taken
    f.bed(0, 0, 'radish'); // taken: ignored
    f.bed(3, 3, 'radish');
    expect(Object.keys(f.farm().plots)).toEqual(['3,3']);
    expect(f.farm().plots['3,3'].growth).toBe(cropById.radish.hours * HOUR);
  });

  it('visiting one: a name, a description, nothing to help with', async () => {
    const g = new Game(newState());
    g.startVisit({ type: 'showcase', showcase: showcaseById.tropic });
    expect(g.visit!.farm.size).toBe(24);
    expect(g.visitName()).toBe(t('showcase.tropic'));
    expect(g.helpLeft()).toBe(0);
    const [k] = Object.keys(g.visit!.farm.plots);
    const [x, y] = k.split(',').map(Number);
    g.visit!.farm.plots[k].growth = 0;
    g.visit!.farm.plots[k].watered = false;
    const gold = g.s.gold;
    await g.doHelp(x, y);
    expect(g.s.gold).toBe(gold);
    expect(g.s.help).toEqual({});
  });
});
