// Village neighbours are computer farmers. In the original these were friends from "My World";
// here their farms are generated deterministically (the same farm for the whole day).
import { CROPS, TREES, ANIMALS, DECOR } from '../data/items';
import { BOY_NAMES, GIRL_NAMES } from '../i18n/people';
import { key, type FarmObject, type Plot, type Pest } from './state';

export interface Npc {
  id: string;
  name: string;
  level: number;
  face: string;
  color: string;
  girl: boolean;
}

const GIRL_FACES = ['👩', '👱‍♀️', '👩‍🦰', '👵', '👧', '👩‍🦱', '👩‍🌾', '🧕'];
const BOY_FACES = ['👨', '👱‍♂️', '👨‍🦰', '👴', '👦', '👨‍🦱', '👨‍🌾', '🧔'];
const COLORS = ['#f6c9d0', '#cde7f6', '#d9f2c9', '#fbe3b5', '#e2d4f7', '#f7d6c4', '#c9efe6', '#f3f0b8'];

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NPCS: Npc[] = [];
{
  const r = rng(2010);
  for (let i = 0; i < 80; i++) {
    const girl = i % 2 === 0;
    const pool = girl ? GIRL_NAMES : BOY_NAMES;
    const name = pool[Math.floor(i / 2) % pool.length];
    const faces = girl ? GIRL_FACES : BOY_FACES;
    NPCS.push({
      id: 'n' + i,
      name,
      level: 3 + Math.floor(r() ** 1.6 * 55),
      face: faces[Math.floor(r() * faces.length)],
      color: COLORS[Math.floor(r() * COLORS.length)],
      girl,
    });
  }
}
export const npcById = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export interface NeighborFarm {
  size: number;
  plots: Record<string, Plot>;
  objects: FarmObject[];
  growStage: Record<string, number>; // growth fraction, 0..1
}

const H = 3_600_000;

export function generateFarm(npc: Npc, day: number): NeighborFarm {
  const r = rng(hashStr(npc.id) ^ (day * 7919));
  const size = npc.level >= 35 ? 18 : npc.level >= 25 ? 16 : npc.level >= 15 ? 14 : npc.level >= 8 ? 12 : 10;
  const plots: Record<string, Plot> = {};
  const objects: FarmObject[] = [];
  const growStage: Record<string, number> = {};
  const occupied = new Set<string>();
  let id = 1;
  const avail = (lvl: number) => lvl <= npc.level;

  // a row of trees along the edges, like on many real farms
  const trees = TREES.filter((t) => avail(t.level));
  const tree = trees[Math.floor(r() * trees.length)];
  const tree2 = trees[Math.floor(r() * trees.length)];
  for (let i = 0; i < size; i++) {
    objects.push({ id: id++, key: 'tree:' + (i % 2 ? tree.id : tree2.id), x: i, y: 0, w: 1, h: 1, flip: false, readyAt: 0 });
    occupied.add(key(i, 0));
    if (i > 0) {
      objects.push({ id: id++, key: 'tree:' + tree.id, x: 0, y: i, w: 1, h: 1, flip: false, readyAt: 0 });
      occupied.add(key(0, i));
    }
  }
  // beds in the middle
  const crops = CROPS.filter((c) => avail(c.level));
  const bands = 1 + Math.floor(r() * 3);
  const cropsChosen = Array.from({ length: bands }, () => crops[Math.floor(r() * crops.length)]);
  const edge = size - 3;
  for (let y = 2; y < edge; y++) {
    for (let x = 2; x < edge; x++) {
      const c = cropsChosen[Math.floor(((y - 2) / (edge - 2)) * bands)];
      const g = r();
      const pest: Pest | null = r() < 0.12 ? (r() < 0.6 ? 'crow' : 'toad') : null;
      plots[key(x, y)] = {
        state: 'growing',
        crop: c.id,
        growth: g * c.hours * H,
        watered: r() > 0.3,
        fertilized: false,
        pest,
      };
      growStage[key(x, y)] = g;
      occupied.add(key(x, y));
    }
  }
  // animals at the bottom
  const animals = ANIMALS.filter((a) => avail(a.level) && a.size === 1);
  for (let x = 1; x < size - 1; x += 1) {
    const y = size - 2;
    if (r() < 0.75 && animals.length) {
      const a = animals[Math.floor(r() * animals.length)];
      objects.push({ id: id++, key: 'animal:' + a.id, x, y, w: 1, h: 1, flip: r() < 0.5, readyAt: 0 });
      occupied.add(key(x, y));
    }
  }
  // some decor on the right
  const decor = DECOR.filter((d) => d.size === 1 && !d.craftOnly && !d.draw && avail(d.level));
  for (let y = 2; y < size - 3; y++) {
    if (r() < 0.45 && decor.length) {
      const d = decor[Math.floor(r() * decor.length)];
      const x = size - 1;
      if (!occupied.has(key(x, y))) objects.push({ id: id++, key: 'decor:' + d.id, x, y, w: 1, h: 1, flip: false });
    }
  }
  return { size, plots, objects, growStage };
}
