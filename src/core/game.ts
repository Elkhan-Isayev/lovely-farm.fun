import {
  ACHIEVEMENTS, ANIMALS, BUILDINGS, CROPS, DECOR, DIG_COST, EXPANSIONS, ITEMS, MATERIALS, RECIPES, TREES,
  animalById, buildingById, cropById, decorById, placeInfo, recipeById, treeById, type BuildingId,
} from '../data/items';
import { itemName, name, personName, placeName, t } from '../i18n';
import { LEGACY_PET_NAMES } from '../i18n/people';
import { levelFromExp } from './levels';
import { NPCS, generateFarm, npcById, type NeighborFarm, type Npc } from './neighbors';
import type { Showcase } from './showcase';
import {
  HOUR, dayIndex, key, newState, unkey,
  type FarmObject, type GameState, type Order, type Plot,
} from './state';

/** A real player from the friends list (comes from the server). */
export interface Friend { id: number; name: string; login: string; level: number; face: string; helpLeft: number; giftSent: boolean }

/** An event from the server inbox: help or a gift from a friend. */
export interface InboxEvent { id: number; type: 'help' | 'gift'; fromName: string; fromFace: string; x?: number; y?: number; kind?: 'chase' | 'water'; key?: string }

export type VisitTarget = { type: 'npc'; npc: Npc } | { type: 'friend'; friend: Friend } | { type: 'showcase'; showcase: Showcase };

/** Network operations the game needs from the server (app.ts plugs in the API). */
export interface SocialPort {
  help(friendId: number, x: number, y: number, kind: 'chase' | 'water'): Promise<{ ok: boolean; left: number; error?: string }>;
  gift(friendId: number, key: string): Promise<{ ok: boolean; error?: string }>;
}

export type Float = { x: number; y: number; text: string; color?: string; icon?: string };

type Events = {
  change: void;
  float: Float;
  toast: { text: string; icon?: string };
  levelup: number;
  achievement: { name: string; diamonds: number };
  visit: VisitTarget | null;
  sound: string; // an effect to play: 'place', 'coin', 'animal:cow', … (the audio layer decides how)
};

/** A pet's name: a letter first, then letters, marks, spaces, hyphens or apostrophes; 2–16 characters. */
export const PET_NAME_RE = /^\p{L}[\p{L}\p{M} '’-]{1,15}$/u;

const GIFT_POOL: { key: string; w: number; level: number }[] = [
  { key: 'item:wood', w: 6, level: 1 },
  { key: 'item:straw', w: 4, level: 1 },
  { key: 'item:nails', w: 3, level: 1 },
  { key: 'item:film', w: 1.5, level: 1 },
  ...TREES.filter((t) => t.giftOnly).map((t) => ({ key: 'tree:' + t.id, w: 1.2, level: t.level })),
  ...ANIMALS.filter((a) => a.giftOnly).map((a) => ({ key: 'animal:' + a.id, w: 1, level: a.level })),
];

export const giftChoices = (level: number) => GIFT_POOL.filter((g) => g.level <= level);

export function giftName(k: string) {
  const [kind, id] = k.split(':');
  if (kind === 'item') return itemName(id);
  return placeName(k);
}

export const HELP_LIMIT = 5;
const PEST_RATE = 0.035; // chance per bed per game hour

export class Game {
  s: GameState;
  private listeners: { [K in keyof Events]?: ((p: Events[K]) => void)[] } = {};
  private occ = new Map<string, number>();
  visit: { target: VisitTarget; farm: NeighborFarm } | null = null;
  pending = new Set<string>(); // cells the farmer is already walking to
  isNew = false;
  friends: Friend[] = [];
  social: SocialPort | null = null;
  appliedEvents: number[] = []; // ids of events already applied to the state (acknowledged on the next save)

  constructor(state: GameState | null) {
    this.isNew = !state;
    this.s = state ?? newState();
    // the pet used to be "Kukusik" by default; old saves get a real dog's name (and keep the right to choose one)
    if (!this.s.pet.renamed && LEGACY_PET_NAMES.includes(this.s.pet.name)) this.s.pet.name = t('pet.defaultName');
    this.rebuildOcc();
  }

  on<K extends keyof Events>(ev: K, fn: (p: Events[K]) => void) {
    const list = (this.listeners[ev] ??= []) as ((p: Events[K]) => void)[];
    list.push(fn);
  }
  emit<K extends keyof Events>(ev: K, p: Events[K]) {
    this.listeners[ev]?.forEach((fn) => fn(p));
  }
  changed() { this.emit('change', undefined); }
  float(x: number, y: number, text: string, color?: string, icon?: string) {
    this.emit('float', { x, y, text, color, icon });
  }
  toast(text: string, icon?: string) { this.emit('toast', { text, icon }); }
  sfx(name: string) { this.emit('sound', name); }

  /* ---------------- time ---------------- */

  now() {
    const c = this.s.clock;
    return c.game + (Date.now() - c.real) * c.speed;
  }
  setSpeed(speed: number) {
    const now = this.now();
    this.s.clock = { game: now, real: Date.now(), speed };
    this.changed();
  }

  get level() { return levelFromExp(this.s.exp); }

  /* ---------------- resources ---------------- */

  addExp(n: number, x?: number, y?: number) {
    if (n <= 0) return;
    const before = this.level;
    this.s.exp += n;
    if (x !== undefined && y !== undefined) this.float(x, y, `+${n}`, '#7ec8ff', '⭐');
    const after = this.level;
    for (let l = before + 1; l <= after; l++) {
      this.s.gold += 50 * l;
      this.s.diamonds = round2(this.s.diamonds + 0.5);
      this.emit('levelup', l);
    }
  }
  addGold(n: number, x?: number, y?: number) {
    this.s.gold += n;
    if (n > 0) this.stat('earned', n);
    if (x !== undefined && y !== undefined && n) this.float(x, y, (n > 0 ? '+' : '') + n, '#ffd54a', '🪙');
  }
  spend(gold: number, diamonds = 0) {
    if (this.s.gold < gold) { this.toast(t('g.noGold'), '🪙'); return false; }
    if (this.s.diamonds + 1e-9 < diamonds) { this.toast(t('g.noGems'), '💎'); return false; }
    this.s.gold -= gold;
    this.s.diamonds = round2(this.s.diamonds - diamonds);
    return true;
  }
  addItem(id: string, n = 1) {
    this.s.cellar[id] = (this.s.cellar[id] ?? 0) + n;
    if (this.s.cellar[id] <= 0) delete this.s.cellar[id];
  }
  addStorage(k: string, n = 1) {
    this.s.storage[k] = (this.s.storage[k] ?? 0) + n;
    if (this.s.storage[k] <= 0) delete this.s.storage[k];
  }

  stat(statName: string, n = 1) {
    this.s.stats[statName] = (this.s.stats[statName] ?? 0) + n;
    for (const a of ACHIEVEMENTS) {
      if (a.stat !== statName) continue;
      let tier = this.s.achievements[a.id] ?? 0;
      while (tier < a.tiers.length && this.s.stats[statName] >= a.tiers[tier]) {
        const d = a.diamonds[tier];
        tier++;
        this.s.achievements[a.id] = tier;
        this.s.diamonds = round2(this.s.diamonds + d);
        this.emit('achievement', { name: `${name('achName', a.id)} ${'★'.repeat(tier)}`, diamonds: d });
      }
    }
  }

  /* ---------------- farm plot ---------------- */

  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.s.size && y < this.s.size; }
  plot(x: number, y: number): Plot | undefined { return this.s.plots[key(x, y)]; }

  rebuildOcc() {
    this.occ.clear();
    for (const o of this.s.objects) for (let dx = 0; dx < o.w; dx++) for (let dy = 0; dy < o.h; dy++) this.occ.set(key(o.x + dx, o.y + dy), o.id);
  }
  objectAt(x: number, y: number): FarmObject | undefined {
    const id = this.occ.get(key(x, y));
    return id === undefined ? undefined : this.s.objects.find((o) => o.id === id);
  }
  isFree(x: number, y: number, w: number, h: number, ignoreId?: number) {
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      const cx = x + dx, cy = y + dy;
      if (!this.inBounds(cx, cy)) return false;
      if (this.plots_has(cx, cy)) return false;
      if (this.pending.has(key(cx, cy))) return false;
      const id = this.occ.get(key(cx, cy));
      if (id !== undefined && id !== ignoreId) return false;
    }
    return true;
  }
  private plots_has(x: number, y: number) { return key(x, y) in this.s.plots; }

  cropStage(p: Plot): number {
    if (!p.crop || p.state === 'soil') return -1;
    if (p.state === 'withered') return 4;
    const total = cropById[p.crop].hours * HOUR;
    const f = p.growth / total;
    return f < 0.12 ? 0 : f < 0.5 ? 1 : f < 1 ? 2 : 3;
  }
  isRipe(p: Plot) { return p.state === 'growing' && !!p.crop && p.growth >= cropById[p.crop].hours * HOUR; }
  timeLeft(p: Plot) { return p.crop ? Math.max(0, cropById[p.crop].hours * HOUR - p.growth) : 0; }

  // ---- checks (before the farmer sets off) ----

  canDig(x: number, y: number): string | null {
    if (!this.inBounds(x, y)) return t('g.outOfBounds');
    const p = this.plot(x, y);
    if (p && p.state !== 'withered') return t('g.alreadyDug');
    if (!p && this.occ.has(key(x, y))) return t('g.occupied');
    if (this.s.gold < DIG_COST) return t('g.noGold');
    return null;
  }
  canPlant(x: number, y: number, cropId: string): string | null {
    const p = this.plot(x, y);
    if (!p || p.state !== 'soil') return t('g.digFirst');
    const c = cropById[cropId];
    if (this.level < c.level) return t('g.needLevel', { n: c.level });
    if (this.s.gold < c.cost) return t('g.noGold');
    return null;
  }

  // ---- effects (when the farmer arrives) ----

  doDig(x: number, y: number) {
    const k = key(x, y);
    this.s.plots[k] = { state: 'soil', growth: 0, watered: false, fertilized: false, pest: null };
    this.addExp(1, x, y);
    this.stat('dug');
    this.rebuildOcc();
  }
  doPlant(x: number, y: number, cropId: string) {
    const p = this.plot(x, y);
    if (!p || p.state !== 'soil') { this.s.gold += cropById[cropId].cost; return; } // refund the seeds
    Object.assign(p, { state: 'growing', crop: cropId, growth: 0, watered: false, fertilized: false, pest: null });
  }
  doWater(x: number, y: number) {
    const p = this.plot(x, y);
    if (!p || p.state !== 'growing' || p.watered) return;
    p.watered = true;
    p.growth = Math.min(p.growth + 0.1 * cropById[p.crop!].hours * HOUR, cropById[p.crop!].hours * HOUR);
    this.addExp(1, x, y);
    this.stat('watered');
  }
  doFertilize(x: number, y: number) {
    const p = this.plot(x, y);
    if (!p || p.state !== 'growing' || !p.watered || p.fertilized || this.isRipe(p)) return;
    p.fertilized = true;
    p.growth = Math.min(p.growth + 0.15 * cropById[p.crop!].hours * HOUR, cropById[p.crop!].hours * HOUR);
    this.addExp(1, x, y);
  }
  doChase(x: number, y: number) {
    const p = this.plot(x, y);
    if (!p?.pest) return;
    p.pest = null;
    this.addExp(1, x, y);
    this.addGold(2);
    this.stat('pests');
  }
  doHarvestPlot(x: number, y: number) {
    const p = this.plot(x, y);
    if (!p || !this.isRipe(p)) return;
    const c = cropById[p.crop!];
    this.addItem(c.id, 1);
    this.float(x, y, t('g.toCellar', { name: name('crop', c.id) }), '#fff');
    this.addExp(c.exp, x, y);
    p.state = 'withered';
    p.growth = -1; // -1 = harvested (not withered)
    this.stat('harvested');
  }
  doClear(x: number, y: number) {
    const p = this.plot(x, y);
    if (!p || p.state !== 'withered') return;
    Object.assign(p, { state: 'soil', crop: undefined, growth: 0, watered: false, fertilized: false, pest: null });
    this.addExp(1, x, y);
    this.stat('dug');
  }

  objectReady(o: FarmObject) {
    if (o.key.startsWith('building:')) return (o.jobs ?? []).some((j) => j.endsAt <= this.now()) || this.greenReady(o) > 0;
    return o.readyAt !== undefined && o.readyAt <= this.now();
  }
  doHarvestObject(o: FarmObject) {
    if (!this.s.objects.includes(o) || o.readyAt === undefined || o.readyAt > this.now()) return;
    const [kind, id] = o.key.split(':');
    const cx = o.x + (o.w - 1) / 2, cy = o.y + (o.h - 1) / 2;
    if (kind === 'tree') {
      const tree = treeById[id];
      this.addItem('t_' + id);
      this.float(cx, cy, t('g.toCellar', { name: name('treeProduct', id) }), '#fff');
      this.addExp(1, cx, cy);
      o.readyAt = this.now() + tree.hours * HOUR;
      this.sfx('harvest');
    } else if (kind === 'animal') {
      const a = animalById[id];
      this.addItem('a_' + id);
      this.float(cx, cy, t('g.toCellar', { name: name('animalProduct', id) }), '#fff');
      this.addExp(2, cx, cy);
      o.readyAt = this.now() + a.hours * HOUR;
      this.sfx('animal:' + id);
    }
    this.stat('harvested');
  }

  /* ---------------- shop and placement ---------------- */

  priceOf(k: string): { gold: number; diamonds: number; level: number; exp: number } {
    const { kind, id } = placeInfo(k);
    if (kind === 'tree') { const t = treeById[id]; return { gold: t.cost, diamonds: t.diamonds ?? 0, level: t.level, exp: t.exp }; }
    if (kind === 'animal') { const a = animalById[id]; return { gold: a.cost, diamonds: 0, level: a.level, exp: a.exp }; }
    if (kind === 'decor') { const d = decorById[id]; return { gold: d.cost, diamonds: d.diamonds ?? 0, level: d.level, exp: Math.round(d.cost / 20) + (d.diamonds ?? 0) * 10 }; }
    const b = buildingById[id as BuildingId];
    return { gold: b.cost, diamonds: 0, level: b.level, exp: Math.round(b.cost / 10) };
  }

  /** Place an object: bought from the shop (fromStorage=false) or taken from storage. */
  place(k: string, x: number, y: number, fromStorage: boolean): boolean {
    const info = placeInfo(k);
    if (!this.isFree(x, y, info.w, info.h)) { this.toast(t('g.cantPlace')); return false; }
    let exp = 0;
    if (fromStorage) {
      if (!this.s.storage[k]) return false;
      this.addStorage(k, -1);
    } else {
      const p = this.priceOf(k);
      if (this.level < p.level) { this.toast(t('g.needLevel', { n: p.level })); return false; }
      if (info.kind === 'building' && this.s.objects.some((o) => o.key === k)) { this.toast(t('g.haveBuilding')); return false; }
      if (!this.spend(p.gold, p.diamonds)) return false;
      exp = p.exp;
      if (p.gold) this.float(x, y, `-${p.gold}`, '#ffb3a0', '🪙');
      if (p.diamonds) this.float(x, y, `-${p.diamonds}`, '#c7a8ff', '💎');
    }
    const o: FarmObject = { id: this.s.nextId++, key: k, x, y, w: info.w, h: info.h, flip: false };
    if (info.kind === 'tree') { o.readyAt = this.now() + treeById[info.id].hours * HOUR; this.stat('trees'); }
    if (info.kind === 'animal') { o.readyAt = this.now() + animalById[info.id].hours * HOUR; this.stat('animals'); }
    if (info.kind === 'building') {
      o.jobs = [];
      if (info.id === 'greenhouse') o.slots = Array.from({ length: 12 }, () => ({ crop: null, plantedAt: 0 }));
    }
    this.s.objects.push(o);
    this.rebuildOcc();
    this.sfx('place');
    this.addExp(exp, x, y);
    this.changed();
    return true;
  }

  move(o: FarmObject, x: number, y: number) {
    if (!this.isFree(x, y, o.w, o.h, o.id)) { this.toast(t('g.cantPlace')); return false; }
    o.x = x; o.y = y;
    this.rebuildOcc();
    this.changed();
    return true;
  }
  flip(o: FarmObject) { o.flip = !o.flip; this.changed(); }

  toStorage(o: FarmObject) {
    if (o.jobs?.length || o.slots?.some((s) => s.crop)) { this.toast(t('g.takeFirst')); return; }
    this.s.objects = this.s.objects.filter((x) => x !== o);
    this.addStorage(o.key);
    this.rebuildOcc();
    this.toast(t('g.toStorage', { name: placeName(o.key) }), '📦');
    this.changed();
  }

  sell(id: string, n: number) {
    const have = this.s.cellar[id] ?? 0;
    n = Math.min(n, have);
    if (n <= 0) return;
    this.addItem(id, -n);
    this.addGold(ITEMS[id].price * n);
    this.sfx('coin');
    this.changed();
  }
  sellAll(filter: (id: string) => boolean) {
    let total = 0;
    for (const [id, n] of Object.entries(this.s.cellar)) {
      if (!filter(id)) continue;
      total += ITEMS[id].price * n;
      delete this.s.cellar[id];
    }
    if (total) { this.addGold(total); this.sfx('coin'); this.toast(t('g.sold', { n: total }), '🪙'); }
    this.changed();
  }
  buyMaterial(id: string) {
    const m = MATERIALS.find((x) => x.id === id)!;
    if (!this.spend(m.price)) return;
    this.addItem(id);
    this.sfx('coin');
    this.changed();
  }

  nextExpansion() { return EXPANSIONS.find((e) => e.size > this.s.size); }
  expand(how: 'gold' | 'diamonds' | 'neighbors') {
    const e = this.nextExpansion();
    if (!e) return;
    if (how === 'neighbors') {
      if (!e.neighbors || this.neighborCount() < e.neighbors) { this.toast(t('g.needNeighbors', { n: e.neighbors }), '👥'); return; }
    } else if (how === 'gold') {
      if (!e.gold || !this.spend(e.gold)) return;
    } else if (!e.diamonds || !this.spend(0, e.diamonds)) return;
    this.s.size = e.size;
    this.sfx('levelup');
    this.toast(t('g.expanded', { n: e.size }), '🗺️');
    this.addExp(e.size * 5);
    this.changed();
  }

  /* ---------------- production ---------------- */

  hasInputs(inputs: Record<string, number>) {
    return Object.entries(inputs).every(([id, n]) => (this.s.cellar[id] ?? 0) >= n);
  }
  startJob(o: FarmObject, recipeId: string) {
    const r = recipeById[recipeId];
    o.jobs ??= [];
    if (o.jobs.length >= 3) { this.toast(t('g.queueFull')); return; }
    if (this.level < r.level) { this.toast(t('g.needLevel', { n: r.level })); return; }
    if (!this.hasInputs(r.inputs)) { this.toast(t('g.noInputs')); return; }
    for (const [id, n] of Object.entries(r.inputs)) this.addItem(id, -n);
    const start = Math.max(this.now(), o.jobs.at(-1)?.endsAt ?? 0);
    o.jobs.push({ recipe: recipeId, startsAt: start, endsAt: start + r.hours * HOUR });
    this.sfx('hammer');
    this.changed();
  }
  collectJobs(o: FarmObject) {
    const now = this.now();
    const done = (o.jobs ?? []).filter((j) => j.endsAt <= now);
    if (!done.length) return 0;
    o.jobs = o.jobs!.filter((j) => j.endsAt > now);
    for (const j of done) {
      const r = recipeById[j.recipe];
      if (r.output.kind === 'item') {
        this.addItem(r.output.id);
        this.float(o.x, o.y, t('g.toCellar', { name: name('recipe', r.id) }), '#fff');
      } else {
        this.addStorage(r.output.key);
        this.float(o.x, o.y, t('g.toStorageItem', { name: name('recipe', r.id) }), '#fff');
      }
      const value = Object.entries(r.inputs).reduce((s, [id, n]) => s + (ITEMS[id]?.price ?? 0) * n, 0);
      this.addExp(Math.round(value / 25) + 3, o.x, o.y);
      this.stat('crafted');
    }
    this.sfx('harvest');
    this.changed();
    return done.length;
  }

  greenReady(o: FarmObject) {
    const now = this.now();
    return (o.slots ?? []).filter((s) => s.crop && s.plantedAt + cropById[s.crop].hours * HOUR <= now).length;
  }
  greenPlant(o: FarmObject, cropId: string) {
    const c = cropById[cropId];
    let n = 0;
    for (const s of o.slots ?? []) {
      if (s.crop) continue;
      if (this.s.gold < c.cost) { this.toast(t('g.noGold')); break; }
      this.s.gold -= c.cost;
      s.crop = cropId;
      s.plantedAt = this.now();
      n++;
    }
    if (n) { this.float(o.x, o.y, `-${n * c.cost}`, '#ffb3a0', '🪙'); this.sfx('sow'); }
    this.changed();
  }
  greenHarvest(o: FarmObject) {
    const now = this.now();
    let n = 0;
    for (const s of o.slots ?? []) {
      if (!s.crop) continue;
      const c = cropById[s.crop];
      if (s.plantedAt + c.hours * HOUR > now) continue;
      this.addItem(c.id);
      this.addExp(c.exp);
      this.stat('harvested');
      s.crop = null;
      n++;
    }
    if (n) { this.float(o.x, o.y, t('g.toCellarN', { n }), '#fff'); this.sfx('harvest'); }
    this.changed();
  }

  /* ---------------- orders ---------------- */

  orderCandidates(): string[] {
    const lvl = this.level;
    const ids = CROPS.filter((c) => c.level <= lvl).map((c) => c.id);
    const kinds = new Set(this.s.objects.map((o) => o.key));
    for (const k of kinds) {
      const [kind, id] = k.split(':');
      if (kind === 'tree') ids.push('t_' + id);
      if (kind === 'animal') ids.push('a_' + id);
      if (kind === 'building') for (const r of RECIPES) if (r.building === id && r.level <= lvl && r.output.kind === 'item') ids.push(r.output.id);
    }
    return ids;
  }
  makeOrder(): Order {
    const cands = this.orderCandidates();
    const npc = NPCS[Math.floor(Math.random() * NPCS.length)];
    const items: Record<string, number> = {};
    const kinds = 1 + Math.floor(Math.random() * Math.min(3, cands.length));
    for (let i = 0; i < kinds; i++) {
      const id = cands[Math.floor(Math.random() * cands.length)];
      const price = ITEMS[id].price;
      const qty = Math.max(1, Math.round((80 + Math.random() * 160) / price));
      items[id] = (items[id] ?? 0) + Math.min(qty, 12);
    }
    const value = Object.entries(items).reduce((s, [id, n]) => s + ITEMS[id].price * n, 0);
    return {
      id: this.s.nextId++,
      from: npc.id,
      items,
      gold: Math.round(value * 1.4 + 20),
      exp: Math.round(value / 12) + 5,
      diamonds: Math.random() < 0.15 ? 1 : 0,
      material: Math.random() < 0.3 ? MATERIALS[Math.floor(Math.random() * 3)].id : undefined,
    };
  }
  fillOrders() {
    while (this.s.orders.length < 3) this.s.orders.push(this.makeOrder());
  }
  completeOrder(o: Order) {
    if (!this.hasInputs(o.items)) { this.toast(t('g.noInputs')); return; }
    for (const [id, n] of Object.entries(o.items)) this.addItem(id, -n);
    this.addGold(o.gold);
    this.addExp(o.exp);
    if (o.diamonds) this.s.diamonds = round2(this.s.diamonds + o.diamonds);
    if (o.material) this.addItem(o.material);
    this.s.orders = this.s.orders.filter((x) => x !== o);
    this.stat('orders');
    this.sfx('coin');
    this.toast(t('g.orderDone', { gold: o.gold }) + (o.diamonds ? ` +${o.diamonds} 💎` : ''), '📦');
    this.fillOrders();
    this.changed();
  }
  replaceOrder(o: Order) {
    if (this.s.orderRefreshAt > this.now()) return;
    this.s.orders = this.s.orders.map((x) => (x === o ? this.makeOrder() : x));
    this.s.orderRefreshAt = this.now() + HOUR;
    this.changed();
  }

  /* ---------------- neighbours and gifts ---------------- */

  maxNeighbors() { return 3 + this.level * 3; }
  invite(id: string) {
    if (this.s.neighbors.includes(id)) return;
    if (this.s.neighbors.length >= this.maxNeighbors()) { this.toast(t('g.moreNeighbors'), '👥'); return; }
    this.s.neighbors.push(id);
    this.toast(t('g.newNeighbor', { name: personName(npcById[id].name) }), npcById[id].face);
    this.addExp(2);
    this.stat('neighbors');
    this.changed();
  }

  neighborCount() { return this.s.neighbors.length + this.friends.length; }

  startVisit(target: VisitTarget, farm?: NeighborFarm) {
    if (target.type === 'showcase') farm = target.showcase.build();
    if (target.type === 'npc') {
      farm = generateFarm(target.npc, dayIndex());
      const h = this.s.help[target.npc.id];
      if (h?.day === dayIndex()) {
        for (const c of h.cells) {
          const p = farm.plots[c];
          if (p) { p.pest = null; p.watered = true; }
        }
      }
    }
    this.visit = { target, farm: farm! };
    this.pending.clear();
    this.emit('visit', target);
    this.changed();
  }
  endVisit() {
    this.visit = null;
    this.pending.clear();
    this.emit('visit', null);
    this.changed();
  }
  visitName() {
    const tg = this.visit?.target;
    if (tg?.type === 'showcase') return t(`showcase.${tg.showcase.id}`);
    return !tg ? '' : tg.type === 'npc' ? personName(tg.npc.name) : tg.friend.name;
  }
  helpLeft(): number {
    const tg = this.visit?.target;
    if (!tg || tg.type === 'showcase') return 0; // showcase farms are only to look at
    if (tg.type === 'friend') return tg.friend.helpLeft;
    const h = this.s.help[tg.npc.id];
    return h?.day === dayIndex() ? Math.max(0, HELP_LIMIT - h.cells.length) : HELP_LIMIT;
  }
  /** What can be done on a neighbour's cell. */
  helpKind(x: number, y: number): 'chase' | 'water' | null {
    const p = this.visit?.farm.plots[key(x, y)];
    if (!p || p.state !== 'growing') return null;
    if (p.pest) return 'chase';
    if (!p.watered) return 'water';
    return null;
  }
  async doHelp(x: number, y: number) {
    const v = this.visit;
    if (!v) return;
    const kind = this.helpKind(x, y);
    if (!kind || this.helpLeft() <= 0) return;
    const tg = v.target;
    if (tg.type === 'friend') {
      if (!this.social) return;
      const res = await this.social.help(tg.friend.id, x, y, kind).catch(() => ({ ok: false, left: tg.friend.helpLeft, error: t('g.noServer') }));
      tg.friend.helpLeft = res.left;
      if (!res.ok) { this.toast(res.error ?? t('g.helpFail')); this.changed(); return; }
    } else if (tg.type === 'npc') {
      const day = dayIndex();
      const h = this.s.help[tg.npc.id]?.day === day ? this.s.help[tg.npc.id] : (this.s.help[tg.npc.id] = { day, cells: [] });
      h.cells.push(key(x, y));
    }
    if (this.visit !== v) return;
    const p = v.farm.plots[key(x, y)]!;
    if (kind === 'chase') p.pest = null; else p.watered = true;
    this.addGold(kind === 'chase' ? 10 : 5, x, y);
    this.addExp(kind === 'chase' ? 2 : 1);
    this.stat('helped');
    if (this.helpLeft() === 0) this.toast(t('g.thanks', { name: this.visitName() }), '💌');
    this.changed();
  }

  /** Apply help and gifts that arrived from friends. */
  applyEvents(events: InboxEvent[]) {
    for (const e of events) {
      if (this.appliedEvents.includes(e.id)) continue;
      this.appliedEvents.push(e.id);
      if (e.type === 'gift' && e.key) {
        this.s.gifts.push({ from: e.fromName, key: e.key });
        this.toast(t('g.giftFrom', { name: e.fromName, gift: giftName(e.key) }), '🎁');
      } else if (e.type === 'help' && e.x !== undefined && e.y !== undefined) {
        const p = this.plot(e.x, e.y);
        if (p && p.state === 'growing') {
          if (e.kind === 'chase') p.pest = null;
          else if (!p.watered) {
            p.watered = true;
            p.growth = Math.min(p.growth + 0.1 * cropById[p.crop!].hours * HOUR, cropById[p.crop!].hours * HOUR);
          }
          this.float(e.x, e.y, e.fromName, '#fff', e.fromFace);
        }
        this.toast(t(e.kind === 'chase' ? 'g.helpedChase' : 'g.helpedWater', { name: e.fromName }), e.fromFace);
      }
    }
    if (events.length) this.changed();
  }

  sendGift(npcId: string) {
    if (this.s.giftsSent[npcId] === dayIndex()) return;
    this.s.giftsSent[npcId] = dayIndex();
    this.addExp(1);
    this.toast(t('g.giftSent', { name: personName(npcById[npcId].name) }), '🎁');
    this.changed();
  }
  async sendFriendGift(f: Friend, giftKey: string) {
    if (!this.social || f.giftSent) return;
    const res = await this.social.gift(f.id, giftKey).catch(() => ({ ok: false, error: t('g.noServer') }));
    if (!res.ok) { this.toast(res.error ?? t('g.failed')); return; }
    f.giftSent = true;
    this.addExp(1);
    this.toast(t('g.giftSent', { name: f.name }), '🎁');
    this.changed();
  }
  acceptGift(i: number) {
    const g = this.s.gifts[i];
    if (!g) return;
    this.s.gifts.splice(i, 1);
    const [kind, id] = g.key.split(':');
    if (kind === 'item') this.addItem(id); else this.addStorage(g.key);
    this.sfx('sparkle');
    this.changed();
  }

  /** Daily login: bonus and gifts from neighbours. */
  daily(): { bonus: number; streak: number; gifts: number } | null {
    const today = dayIndex();
    if (this.s.lastLoginDay === today) return null;
    this.s.streak = this.s.lastLoginDay === today - 1 ? this.s.streak + 1 : 1;
    this.s.lastLoginDay = today;
    const bonus = 50 * Math.min(this.s.streak, 5) + this.level * 10;
    this.s.gold += bonus;
    let gifts = 0;
    const pool = giftChoices(this.level);
    const n = Math.min(this.s.neighbors.length, 2 + Math.floor(this.s.neighbors.length / 4));
    for (let i = 0; i < n; i++) {
      const from = npcById[this.s.neighbors[Math.floor(Math.random() * this.s.neighbors.length)]].name;
      let gk: string;
      if (this.s.wish && Math.random() < 0.4) gk = this.s.wish;
      else {
        const total = pool.reduce((s, g) => s + g.w, 0);
        let r = Math.random() * total;
        gk = pool.find((g) => (r -= g.w) < 0)?.key ?? 'item:wood';
      }
      this.s.gifts.push({ from, key: gk, npc: true });
      gifts++;
    }
    this.fillOrders();
    this.changed();
    return { bonus, streak: this.s.streak, gifts };
  }

  /* ---------------- pet ---------------- */

  petHappy() { return this.now() - this.s.pet.fedAt < 8 * HOUR; }
  feedPet() {
    if (this.petHappy()) { this.toast(t('g.petFull', { name: this.s.pet.name }), '🐶'); return; }
    if (!this.spend(20)) return;
    this.s.pet.fedAt = this.now();
    this.sfx('bark');
    this.addExp(3, -1.5, 1.5);
    this.toast(t('g.petFed', { name: this.s.pet.name }), '🦴');
    this.changed();
  }
  /** Name the pet: allowed once, 2–16 letters (spaces, hyphens and apostrophes inside). */
  renamePet(raw: string): boolean {
    if (this.s.pet.renamed) { this.toast(t('pet.renamedAlready'), '🐶'); return false; }
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!PET_NAME_RE.test(name)) { this.toast(t('pet.badName'), '🐶'); return false; }
    this.s.pet.name = name;
    this.s.pet.renamed = true;
    this.sfx('bark');
    this.toast(t('pet.renamedTo', { name }), '🐶');
    this.changed();
    return true;
  }
  petPet() {
    if (this.now() - this.s.pet.pettedAt < HOUR) return;
    this.s.pet.pettedAt = this.now();
    this.sfx('bark');
    this.addExp(1, -1.5, 1.5);
  }

  /* ---------------- tick ---------------- */

  private petTimer = 0;

  tick(realDt: number) {
    const now = this.now();
    const dt = Math.max(0, now - this.s.lastTick);
    this.s.lastTick = now;
    const online = realDt < 5; // pests don't appear retroactively after a long absence
    const scarecrows = this.s.objects.filter((o) => o.key === 'decor:scarecrow');
    let pests = 0;
    for (const p of Object.values(this.s.plots)) if (p.pest) pests++;
    const maxPests = Math.ceil(this.s.size / 2);
    let dirty = false;
    for (const [k, p] of Object.entries(this.s.plots)) {
      if (p.state !== 'growing' || !p.crop) continue;
      const total = cropById[p.crop].hours * HOUR;
      const wasRipe = p.growth >= total;
      if (!p.pest) p.growth += dt;
      if (!wasRipe && p.growth >= total) dirty = true;
      if (p.growth >= total * 2) { p.state = 'withered'; dirty = true; continue; }
      if (online && !p.pest && p.growth < total && pests < maxPests && Math.random() < PEST_RATE * (dt / HOUR)) {
        const [x, y] = unkey(k);
        const kind = Math.random() < 0.65 ? 'crow' : 'toad';
        if (kind === 'crow' && scarecrows.some((s) => Math.abs(s.x - x) <= 3 && Math.abs(s.y - y) <= 3)) continue;
        p.pest = kind;
        pests++;
        dirty = true;
      }
    }
    // a fed dog chases a pest away by himself now and then
    if (online && this.petHappy() && pests > 0) {
      this.petTimer += realDt;
      if (this.petTimer > 20) {
        this.petTimer = 0;
        const withPest = Object.entries(this.s.plots).find(([, p]) => p.pest);
        if (withPest) {
          withPest[1].pest = null;
          const [x, y] = unkey(withPest[0]);
          this.float(x, y, t('g.petChased', { name: this.s.pet.name }), '#fff', '🐶');
          dirty = true;
        }
      }
    }
    if (dirty) this.changed();
  }

  /* ---------------- misc ---------------- */

  shopLists() {
    return { CROPS, TREES: TREES.filter((t) => !t.giftOnly), ANIMALS: ANIMALS.filter((a) => !a.giftOnly), DECOR: DECOR.filter((d) => !d.craftOnly), BUILDINGS: BUILDINGS.filter((b) => !b.craftOnly) };
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
