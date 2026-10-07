import { describe, expect, it, vi } from 'vitest';
import { dayIndex, key, loadState, newState, saveState, unkey, wipeSave } from '../src/core/state';

describe('state', () => {
  it('cell key round trip', () => {
    expect(key(3, 7)).toBe('3,7');
    expect(unkey('3,7')).toEqual([3, 7]);
  });

  it('new farm: 8×8, starter beds, trees, a hen and a gnome', () => {
    const s = newState();
    expect(s.size).toBe(8);
    expect(s.gold).toBe(300);
    expect(Object.keys(s.plots)).toHaveLength(18);
    expect(s.objects.map((o) => o.key)).toEqual(['tree:cherry', 'tree:apple', 'animal:chicken', 'decor:gnome']);
    expect(s.pet.name).toBe('Buddy');
  });

  it('day index uses local time', () => {
    const t = new Date(2026, 9, 4, 12).getTime();
    expect(dayIndex(t + 86_400_000)).toBe(dayIndex(t) + 1);
    expect(typeof dayIndex()).toBe('number');
  });

  it('saves to and loads from localStorage', () => {
    expect(loadState()).toBeNull();
    const s = newState();
    s.gold = 777;
    saveState(s);
    expect(loadState()!.gold).toBe(777);
    wipeSave();
    expect(loadState()).toBeNull();
  });

  it('ignores broken or outdated saves', () => {
    localStorage.setItem('lovely-farm-save-v1', '{oops');
    expect(loadState()).toBeNull();
    localStorage.setItem('lovely-farm-save-v1', JSON.stringify({ version: 0 }));
    expect(loadState()).toBeNull();
  });

  it('unavailable storage does not crash the game', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveState(newState())).not.toThrow();
    spy.mockRestore();
    const spy2 = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => wipeSave()).not.toThrow();
    spy2.mockRestore();
  });
});
