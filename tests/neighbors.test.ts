import { describe, expect, it } from 'vitest';
import { NPCS, generateFarm, hashStr, npcById, rng } from '../src/core/neighbors';

describe('village neighbours', () => {
  it('80 neighbours with unique ids and level 3+', () => {
    expect(NPCS).toHaveLength(80);
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(80);
    for (const n of NPCS) expect(n.level).toBeGreaterThanOrEqual(3);
    expect(npcById.n0.girl).toBe(true);
    expect(npcById.n1.girl).toBe(false);
  });

  it('the random generator is deterministic', () => {
    const a = rng(42), b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(hashStr('abc')).toBe(hashStr('abc'));
    expect(hashStr('abc')).not.toBe(hashStr('abd'));
  });

  it('a neighbour farm stays the same for a day and changes the next', () => {
    const n = NPCS[5];
    const f1 = generateFarm(n, 100), f2 = generateFarm(n, 100), f3 = generateFarm(n, 101);
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2));
    expect(JSON.stringify(f1)).not.toBe(JSON.stringify(f3));
  });

  it('farm size depends on level and stays within bounds', () => {
    for (const n of NPCS) {
      const f = generateFarm(n, 1);
      const want = n.level >= 35 ? 18 : n.level >= 25 ? 16 : n.level >= 15 ? 14 : n.level >= 8 ? 12 : 10;
      expect(f.size).toBe(want);
      expect(Object.keys(f.plots).length).toBeGreaterThan(0);
      for (const o of f.objects) {
        expect(o.x).toBeLessThan(f.size);
        expect(o.y).toBeLessThan(f.size);
      }
    }
  });
});
