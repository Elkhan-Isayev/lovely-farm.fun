// A friend's farm arrives from the server as it was last saved. We advance growth to "now"
// so the visitor sees what is ripe, exactly as the owner's client would.
import { cropById } from '../data/items';
import type { NeighborFarm } from './neighbors';
import { HOUR, type FarmObject, type Plot } from './state';

export interface SavedFarm { size: number; plots: Record<string, Plot>; objects: FarmObject[]; lastTick: number }

export function projectFarm(f: SavedFarm, now: number): NeighborFarm {
  const dt = Math.max(0, now - (f.lastTick ?? now));
  const plots: Record<string, Plot> = {};
  for (const [k, p] of Object.entries(f.plots ?? {})) {
    const q = { ...p };
    if (q.state === 'growing' && q.crop && cropById[q.crop]) {
      if (!q.pest) q.growth += dt;
      if (q.growth >= cropById[q.crop].hours * HOUR * 2) q.state = 'withered';
    }
    plots[k] = q;
  }
  return { size: f.size, plots, objects: (f.objects ?? []).map((o) => ({ ...o })), growStage: {} };
}
