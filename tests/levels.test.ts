import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, expForLevel, expToNext, levelFromExp, levelProgress } from '../src/core/levels';

describe('levels', () => {
  it('XP to the next level grows', () => {
    for (let l = 1; l < MAX_LEVEL; l++) expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
    expect(expToNext(1)).toBe(30);
  });

  it('level from XP', () => {
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(29)).toBe(1);
    expect(levelFromExp(30)).toBe(2);
    expect(levelFromExp(expForLevel(10))).toBe(10);
    expect(levelFromExp(expForLevel(10) - 1)).toBe(9);
    expect(levelFromExp(1e12)).toBe(MAX_LEVEL);
    expect(expForLevel(999)).toBe(expForLevel(MAX_LEVEL));
  });

  it('progress within a level', () => {
    expect(levelProgress(10)).toEqual({ level: 1, cur: 10, need: 30 });
    expect(levelProgress(1e12)).toEqual({ level: MAX_LEVEL, cur: 1, need: 1 });
  });
});
