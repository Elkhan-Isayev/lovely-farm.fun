import { describe, expect, it } from 'vitest';
import { projectFarm } from '../src/core/project';
import { HOUR, type Plot } from '../src/core/state';

const plot = (p: Partial<Plot>): Plot => ({ state: 'growing', crop: 'radish', growth: 0, watered: false, fertilized: false, pest: null, ...p });

describe('friend farm projection', () => {
  it('advances growth, pests stop it, overripe crops wither', () => {
    const f = projectFarm({
      size: 10,
      lastTick: 0,
      plots: { a: plot({}), b: plot({ pest: 'crow' }), c: plot({ growth: 7 * HOUR }), d: plot({ state: 'soil', crop: undefined }) },
      objects: [{ id: 1, key: 'tree:apple', x: 0, y: 0, w: 1, h: 1, flip: false }],
    }, 2 * HOUR);
    expect(f.plots.a.growth).toBe(2 * HOUR);
    expect(f.plots.b.growth).toBe(0);
    expect(f.plots.c.state).toBe('withered');
    expect(f.plots.d.state).toBe('soil');
    expect(f.objects).toHaveLength(1);
    expect(f.size).toBe(10);
  });

  it('never goes back in time and tolerates missing fields', () => {
    const f = projectFarm({ size: 8, lastTick: 10, plots: { a: plot({ growth: 5 }) }, objects: [] }, 0);
    expect(f.plots.a.growth).toBe(5);
    const g = projectFarm({ size: 8 } as never, 0);
    expect(g.plots).toEqual({});
    expect(g.objects).toEqual([]);
  });
});
