// Showcase farms: three hand-built "maxed out" farms that every player has in the friends list,
// to look at for ideas. They are bigger than any player's farm, everything is ripe, and they can
// only be looked at (no help, no gifts).
import { cropById, placeInfo } from '../data/items';
import type { NeighborFarm } from './neighbors';
import { HOUR, key, type FarmObject, type Plot } from './state';

export type ShowcaseId = 'estate' | 'blossom' | 'tropic';

export interface Showcase {
  id: ShowcaseId;
  face: string;
  color: string;
  level: number;
  build(): NeighborFarm;
}

/** Lays out a farm: objects keep their footprint free of beds and other objects. */
export function layout(size: number) {
  const plots: Record<string, Plot> = {};
  const objects: FarmObject[] = [];
  const taken = new Set<string>();
  let id = 1;
  const free = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > size || y + h > size) return false;
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) if (taken.has(key(i, j))) return false;
    return true;
  };
  return {
    size,
    free,
    /** Place a tree, animal, decoration or building; false if it doesn't fit. */
    put(placeKey: string, x: number, y: number, flip = false): boolean {
      const { w, h } = placeInfo(placeKey);
      if (!free(x, y, w, h)) return false;
      for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) taken.add(key(i, j));
      const o: FarmObject = { id: id++, key: placeKey, x, y, w, h, flip, readyAt: 0 };
      if (placeKey === 'building:greenhouse') {
        const flowers = ['rose', 'tulip', 'orchid', 'gerbera'];
        o.slots = Array.from({ length: 12 }, (_, i) => ({ crop: flowers[i % flowers.length], plantedAt: 0 }));
      }
      objects.push(o);
      return true;
    },
    /** A ripe, watered bed. */
    bed(x: number, y: number, crop: string) {
      if (!free(x, y, 1, 1)) return;
      taken.add(key(x, y));
      plots[key(x, y)] = { state: 'growing', crop, growth: cropById[crop].hours * HOUR, watered: true, fertilized: true, pest: null };
    },
    farm(): NeighborFarm {
      return { size, plots, objects, growStage: {} };
    },
  };
}

const pick = <T>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length];

/** "Golden Harvest": a classic country estate — orchards, rainbow fields, every workshop, a ranch. */
function estate(): NeighborFarm {
  const f = layout(24);
  const orchard = ['apple', 'cherry', 'pear', 'apricot', 'plum', 'orange', 'lemon', 'pomegranate'];
  for (let i = 0; i < 24; i++) {
    f.put('tree:' + pick(orchard, i), i, 0);
    f.put('tree:' + pick(orchard, i + 3), 0, i);
  }
  // main paths: a cross through the middle, lit by lamps
  for (const i of [4, 8, 16, 20]) { f.put('decor:lamp', i, 12); f.put('decor:lamp', 12, i); }
  for (let i = 1; i < 24; i++) { f.put('decor:path', i, 12); f.put('decor:path', 12, i); }
  // rainbow fields (back left)
  const stripes = ['tomato', 'pepper', 'corn', 'sunflower', 'carrot', 'pumpkin', 'cabbage', 'watermelon', 'eggplant', 'strawberry', 'grape'];
  for (let y = 1; y < 12; y++) for (let x = 1; x < 12; x++) f.bed(x, y, pick(stripes, y - 1));
  // the yard (back right): every building, a fountain, a well, flowers
  f.put('building:mill', 13, 1);
  f.put('building:workshop', 16, 1);
  f.put('building:juicer', 19, 1);
  f.put('building:kitchen', 13, 4);
  f.put('building:greenhouse', 16, 4);
  f.put('building:greenhouse', 19, 4);
  for (let y = 1; y < 8; y += 2) f.put('tree:lemon', 22, y);
  f.put('decor:fountain', 13, 8);
  f.put('decor:well', 15, 8);
  for (let x = 16; x < 23; x++) f.put('decor:flowerbed', x, 8);
  for (let x = 15; x < 23; x++) f.bed(x, 9, 'tulip');
  for (let x = 13; x < 23; x++) f.bed(x, 10, x % 2 ? 'wheat' : 'rice');
  for (let x = 13; x < 23; x++) f.bed(x, 11, 'sunflower');
  // the ranch (front left): a fenced paddock
  for (let x = 1; x < 12; x++) { f.put('decor:fence_white', x, 13); f.put('decor:fence_white', x, 22); }
  ['animal:cow', 'animal:horse', 'animal:burenka', 'animal:dapple', 'animal:cow'].forEach((a, i) => f.put(a, 1 + i * 2, 14, i % 2 === 1));
  ['animal:sheep', 'animal:goat', 'animal:chicken', 'animal:pig', 'animal:goose', 'animal:turkey', 'animal:foal', 'animal:sheep', 'animal:chicken', 'animal:goat']
    .forEach((a, i) => f.put(a, 1 + i, 17, i % 2 === 0));
  f.put('decor:pond', 2, 19);
  f.put('decor:pond', 5, 19);
  for (const x of [8, 9, 10]) f.put('animal:beehive', x, 19);
  for (let x = 1; x < 12; x++) f.put(x % 2 ? 'animal:chicken' : 'animal:goose', x, 21, x % 3 === 0);
  // the berry garden (front right)
  const berries = ['raspberry', 'blueberry', 'blackberry', 'strawberry', 'rose'];
  for (let y = 13; y < 18; y++) for (let x = 13; x < 23; x++) f.bed(x, y, pick(berries, y));
  for (let x = 13; x < 23; x += 2) f.put('tree:' + pick(['hazel', 'gooseberry', 'seabuckthorn', 'rowan', 'oak'], x), x, 19);
  for (const [k, x] of [['decor:scarecrow', 13], ['decor:gnome', 15], ['decor:bench', 17], ['decor:birdhouse', 19], ['decor:balloons', 21]] as const) f.put(k, x, 21);
  for (const [k, x] of [['decor:haybales', 14], ['decor:wheelbarrow', 16], ['decor:mailbox', 18], ['decor:minimill', 20], ['decor:tea_table', 22]] as const) f.put(k, x, 18);
  // a low border along the front edges
  for (let i = 1; i < 24; i++) { f.put('decor:hedge', i, 23); f.put('decor:flowerbed', 23, i); }
  return f.farm();
}

/** "Blossom Garden": rings of flowers around a fountain, alleys with statues, swans and peacocks. */
function blossom(): NeighborFarm {
  const f = layout(24);
  f.put('decor:fountain_angel', 11, 11);
  // the outer ring: birches at the back, topiaries, statues and hedges in front
  const front = ['decor:hedge', 'decor:topiary_heart', 'decor:hedge', 'decor:statue_lovers', 'decor:hedge', 'decor:topiary_peacock', 'decor:hedge', 'decor:vase'];
  for (let i = 0; i < 24; i++) {
    if (i === 11 || i === 12) continue;
    f.put('tree:birch', i, 0);
    f.put('tree:birch', 0, i);
    f.put(pick(front, i), i, 23);
    f.put(pick(front, i + 4), 23, i);
  }
  // guests on the alleys
  for (const [k, x, y] of [['animal:swan', 11, 1], ['animal:swan', 12, 1], ['animal:peacock', 1, 11], ['animal:peacock', 1, 12],
    ['decor:bench', 11, 22], ['decor:bench', 22, 11], ['decor:smileflower', 12, 22], ['decor:smileflower', 22, 12],
    ['decor:gnome', 11, 4], ['decor:gnome', 12, 19], ['decor:gnome', 4, 12], ['decor:gnome', 19, 11],
    ['decor:bunny', 12, 7], ['decor:bunny', 11, 16], ['decor:bunny', 7, 11], ['decor:bunny', 16, 12],
    ['decor:arch_roses', 11, 3], ['decor:arch_roses', 12, 20], ['decor:arch_roses', 3, 12], ['decor:arch_roses', 20, 11],
    ['decor:lamp_double', 10, 10], ['decor:lamp_double', 13, 10], ['decor:lamp_double', 10, 13], ['decor:lamp_double', 13, 13],
    ['decor:angel', 6, 6], ['decor:angel', 17, 17], ['decor:fountain_heart', 5, 16], ['decor:fountain_heart', 16, 5],
    ['decor:swing', 6, 17], ['decor:gazebo', 16, 15], ['decor:birdbath', 17, 6], ['decor:tea_table', 7, 18]] as const) f.put(k, x, y, x > y);
  // rings of flowers (squares around the fountain look like diamonds on screen), with two stone rings
  const rings = ['rose', 'tulip', 'violet', '', 'orchid', 'gerbera', 'chamomile', 'rose', '', 'tulip', 'sunflower'];
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const ring = Math.max(Math.abs(x - 11.5), Math.abs(y - 11.5)) - 0.5; // 0 = the fountain
      if (ring < 1) continue;
      const crop = rings[ring - 1];
      if (x === 11 || x === 12 || y === 11 || y === 12 || !crop) f.put('decor:path', x, y);
      else f.bed(x, y, crop);
    }
  }
  return f.farm();
}

/** "Tropical Paradise": palms and citrus groves, a lagoon with a ship, plantations, a safari. */
function tropic(): NeighborFarm {
  const f = layout(24);
  const palms = ['banana', 'dates', 'coffee', 'orange', 'banana', 'passion', 'lime', 'avocado', 'grapefruit', 'olive', 'lemon', 'dates'];
  for (let i = 0; i < 24; i++) {
    f.put('tree:' + pick(palms, i), i, 0);
    f.put('tree:' + pick(palms, i + 5), 0, i);
  }
  // plantations (back left): sugarcane, rice, tea, melons, peppers
  const rows = ['sugarcane', 'sugarcane', 'rice', 'rice', 'tea', 'melon', 'watermelon', 'chili', 'pepper', 'eggplant', 'grape'];
  for (let y = 1; y < 12; y++) for (let x = 1; x < 15; x++) f.bed(x, y, pick(rows, y - 1));
  // coffee and citrus grove (back right)
  const grove = ['coffee', 'orange', 'lemon', 'lime', 'grapefruit', 'passion', 'avocado'];
  for (let y = 1; y < 12; y += 2) for (let x = 16; x < 24; x += 2) f.put('tree:' + pick(grove, x + y), x, y);
  // a promenade and the lagoon with the ship (front centre)
  for (const x of [2, 6, 10, 14, 18, 22]) f.put('decor:tiki', x, 12);
  for (let x = 1; x < 23; x++) f.put('decor:path', x, 12);
  for (const [x, y] of [[7, 17], [13, 17], [14, 13], [6, 13]]) f.put('decor:lantern_stone', x, y);
  f.put('decor:ship', 9, 15);
  for (const [x, y] of [[7, 13], [9, 13], [11, 13], [7, 15], [12, 15], [7, 18], [9, 18], [11, 18]]) f.put('decor:pond', x, y);
  // the safari
  for (const [k, x, y] of [['animal:lion', 2, 14], ['animal:turtle', 2, 17], ['animal:raccoon', 2, 20], ['animal:ostrich', 5, 14], ['animal:ostrich', 5, 16],
    ['animal:parrot', 5, 18], ['animal:parrot', 6, 18], ['animal:peacock', 5, 20], ['animal:peacock', 6, 20], ['animal:dapple', 15, 14], ['animal:turtle', 15, 17],
    ['animal:lion', 18, 14], ['animal:parrot', 18, 17], ['animal:parrot', 19, 17], ['animal:swan', 14, 20], ['animal:swan', 15, 20]] as const) f.put(k, x, y, x > 12);
  for (const [k, x, y] of [['decor:chest', 8, 21], ['decor:chest', 13, 21], ['decor:car', 17, 20], ['decor:balloons', 21, 14], ['decor:star', 21, 17],
    ['decor:globe', 20, 20], ['decor:alien', 21, 21], ['decor:pinwheel', 22, 19], ['decor:sunpot', 4, 22], ['decor:smileflower', 10, 22]] as const) f.put(k, x, y);
  // a flowery front border, and exotic flowers wherever the safari left grass
  for (let i = 1; i < 24; i++) { f.put(i % 2 ? 'decor:sunpot' : 'decor:flowerbed', i, 23); f.put(i % 2 ? 'decor:flowerbed' : 'decor:smileflower', 23, i); }
  for (let y = 13; y < 23; y++) for (let x = 1; x < 23; x++) f.bed(x, y, (x + y) % 2 ? 'violet' : 'strawberry'); // low, so the animals stay visible
  return f.farm();
}

export const SHOWCASES: Showcase[] = [
  { id: 'estate', face: '🏰', color: '#fbe3b5', level: 99, build: estate },
  { id: 'blossom', face: '🌸', color: '#f6c9d0', level: 99, build: blossom },
  { id: 'tropic', face: '🌴', color: '#c9efe6', level: 99, build: tropic },
];
export const showcaseById = Object.fromEntries(SHOWCASES.map((s) => [s.id, s])) as Record<ShowcaseId, Showcase>;
