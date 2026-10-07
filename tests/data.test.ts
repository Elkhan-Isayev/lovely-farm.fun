import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, ANIMALS, BUILDINGS, CROPS, DECOR, EXPANSIONS, ITEMS, MATERIALS, RECIPES, TREES,
  animalById, buildingById, cropById, decorById, placeInfo, recipeById, treeById,
} from '../src/data/items';

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('game data', () => {
  it('ids are unique within each category', () => {
    for (const list of [CROPS, TREES, ANIMALS, DECOR, BUILDINGS, MATERIALS, RECIPES, ACHIEVEMENTS]) expect(unique(list.map((x) => x.id))).toBe(true);
  });

  it('crop numbers match the original table (radish, watermelon, gerbera)', () => {
    expect(cropById.radish).toMatchObject({ exp: 1, level: 1, hours: 4, cost: 10, sell: 24 });
    expect(cropById.watermelon).toMatchObject({ exp: 12, level: 18, hours: 10, cost: 64, sell: 132 });
    expect(cropById.gerbera).toMatchObject({ level: 35, hours: 4, cost: 300, sell: 348 });
    expect(CROPS).toHaveLength(37);
  });

  it('every crop sells for more than its seeds and has positive growth time', () => {
    for (const c of CROPS) {
      expect(c.sell).toBeGreaterThan(c.cost);
      expect(c.hours).toBeGreaterThan(0);
    }
  });

  it('trees and animals cost coins or diamonds; gift-only ones are free', () => {
    for (const t of TREES) {
      if (t.giftOnly) expect(t.cost).toBe(0);
      else expect(t.cost > 0 || (t.diamonds ?? 0) > 0).toBe(true);
    }
    for (const a of ANIMALS) {
      if (a.giftOnly) expect(a.cost).toBe(0);
      else expect(a.cost).toBeGreaterThan(0);
    }
    expect(treeById.dates.diamonds).toBe(10);
    expect(treeById.coffee.diamonds).toBe(15);
  });

  it('every recipe input exists in the item registry', () => {
    for (const r of RECIPES) {
      for (const id of Object.keys(r.inputs)) expect(ITEMS[id], `${r.id}: ${id}`).toBeDefined();
      if (r.output.kind === 'item') expect(ITEMS[r.output.id].price).toBeGreaterThan(0);
      else expect(() => placeInfo(r.output.kind === 'place' ? r.output.key : '')).not.toThrow();
      expect(buildingById[r.building]).toBeDefined();
    }
    expect(recipeById.r_greenhouse.inputs).toEqual({ wood: 20, film: 10 });
  });

  it('products are worth more than inputs (×1.5 + 10)', () => {
    const r = recipeById.tomatojuice;
    expect(ITEMS.tomatojuice.price).toBe(Math.round(ITEMS.tomato.price * 3 * 1.5 + 10));
    expect(r.output).toEqual({ kind: 'item', id: 'tomatojuice' });
  });

  it('item registry: crops, fruits, animal products, materials', () => {
    expect(ITEMS.radish.price).toBe(24);
    expect(ITEMS.t_apple).toMatchObject({ price: 35, emoji: '🍎' });
    expect(ITEMS.a_cow).toMatchObject({ price: 150, emoji: '🥛' });
    expect(ITEMS.wood.price).toBe(25);
  });

  it('farm expansions increase like in the original', () => {
    expect(EXPANSIONS.map((e) => e.size)).toEqual([8, 10, 12, 14, 16, 18]);
    expect(EXPANSIONS[1].gold).toBe(500);
    expect(EXPANSIONS[2]).toMatchObject({ diamonds: 5, neighbors: 10 });
  });

  it('placeInfo for every object kind', () => {
    expect(placeInfo('tree:apple')).toMatchObject({ kind: 'tree', w: 1, h: 1, emoji: '🍎' });
    expect(placeInfo('tree:plum').emoji).toBe('🌳');
    expect(placeInfo('animal:cow')).toMatchObject({ kind: 'animal', w: 2, h: 2 });
    expect(placeInfo('decor:ship')).toMatchObject({ kind: 'decor', w: 3, h: 3 });
    expect(placeInfo('building:greenhouse')).toMatchObject({ kind: 'building', w: 2, h: 3 });
    expect(animalById.chicken.productEmoji).toBe('🥚');
    expect(decorById.scarecrow.craftOnly).toBe(true);
  });

  it('achievements: tiers increase and each has a reward', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.tiers.length).toBe(a.diamonds.length);
      expect([...a.tiers].sort((x, y) => x - y)).toEqual(a.tiers);
    }
  });

  it('data carries no display names: they all live in i18n', () => {
    for (const list of [CROPS, TREES, ANIMALS, DECOR, BUILDINGS, MATERIALS, RECIPES, ACHIEVEMENTS]) {
      for (const x of list) expect(JSON.stringify(x)).not.toMatch(/[\u0400-\u04ff]/);
    }
  });
});
