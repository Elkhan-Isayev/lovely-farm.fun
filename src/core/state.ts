import { EXPANSIONS } from '../data/items';
import { t } from '../i18n';

export const HOUR = 3_600_000;

export type Pest = 'crow' | 'toad';

export interface Plot {
  state: 'soil' | 'growing' | 'withered';
  crop?: string;
  growth: number; // accumulated game-time growth, ms
  watered: boolean;
  fertilized: boolean;
  pest: Pest | null;
}

export interface Job { recipe: string; startsAt: number; endsAt: number }

export interface GreenSlot { crop: string | null; plantedAt: number }

export interface FarmObject {
  id: number;
  key: string; // 'tree:apple', 'animal:cow', 'decor:gnome', 'building:mill'
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  readyAt?: number; // trees and animals
  jobs?: Job[]; // production buildings
  slots?: GreenSlot[]; // greenhouse
  builtAt?: number; // construction time (reserved)
}

export interface Order {
  id: number;
  from: string;
  items: Record<string, number>;
  gold: number;
  exp: number;
  diamonds: number;
  material?: string;
}

export interface Gift { from: string; key: string; npc?: boolean } // key: 'item:wood' | 'tree:orange' | 'animal:pig'

export interface Look { gender: 'boy' | 'girl'; hair: string; shirt: string; pants: string }

export interface GameState {
  version: 1;
  createdAt: number;
  clock: { game: number; real: number; speed: number };
  lastTick: number; // game time of the last tick
  size: number;
  gold: number;
  diamonds: number;
  exp: number;
  plots: Record<string, Plot>; // "x,y"
  objects: FarmObject[];
  nextId: number;
  cellar: Record<string, number>;
  storage: Record<string, number>;
  neighbors: string[];
  help: Record<string, { day: number; cells: string[] }>;
  giftsSent: Record<string, number>;
  gifts: Gift[];
  wish: string | null;
  lastGiftDay: number;
  lastLoginDay: number;
  streak: number;
  orders: Order[];
  orderRefreshAt: number;
  pet: { name: string; fedAt: number; pettedAt: number; renamed?: boolean }; // the name can be chosen once
  look: Look;
  stats: Record<string, number>;
  achievements: Record<string, number>; // id → reached tier
  tutorialDone: boolean;
  charPos: { x: number; y: number };
}

export const key = (x: number, y: number) => `${x},${y}`;
export const unkey = (k: string) => k.split(',').map(Number) as [number, number];

export function dayIndex(t = Date.now()) {
  const d = new Date(t);
  return Math.floor((t - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

export function newState(): GameState {
  const now = Date.now();
  const s: GameState = {
    version: 1,
    createdAt: now,
    clock: { game: now, real: now, speed: 1 },
    lastTick: now,
    size: EXPANSIONS[0].size,
    gold: 300,
    diamonds: 5,
    exp: 0,
    plots: {},
    objects: [],
    nextId: 1,
    cellar: { radish: 2, potato: 1 },
    storage: {},
    neighbors: [],
    help: {},
    giftsSent: {},
    gifts: [],
    wish: null,
    lastGiftDay: 0,
    lastLoginDay: 0,
    streak: 0,
    orders: [],
    orderRefreshAt: 0,
    pet: { name: t('pet.defaultName'), fedAt: 0, pettedAt: 0 },
    look: { gender: 'girl', hair: '#3a2416', shirt: '#f2efe6', pants: '#3f7a3a' },
    stats: {},
    achievements: {},
    tutorialDone: false,
    charPos: { x: 3.5, y: 3.5 },
  };
  // starter beds: a row of almost-ripe radishes, a row of dug soil
  for (let x = 1; x <= 6; x++) {
    s.plots[key(x, 1)] = { state: 'growing', crop: 'radish', growth: 3.6 * HOUR, watered: true, fertilized: false, pest: null };
    s.plots[key(x, 2)] = { state: 'growing', crop: 'potato', growth: 2 * HOUR, watered: false, fertilized: false, pest: null };
    s.plots[key(x, 3)] = { state: 'soil', growth: 0, watered: false, fertilized: false, pest: null };
  }
  s.objects.push({ id: s.nextId++, key: 'tree:cherry', x: 0, y: 6, w: 1, h: 1, flip: false, readyAt: now + 0.5 * HOUR });
  s.objects.push({ id: s.nextId++, key: 'tree:apple', x: 0, y: 7, w: 1, h: 1, flip: false, readyAt: now + 20 * HOUR });
  s.objects.push({ id: s.nextId++, key: 'animal:chicken', x: 7, y: 6, w: 1, h: 1, flip: true, readyAt: now + 0.3 * HOUR });
  s.objects.push({ id: s.nextId++, key: 'decor:gnome', x: 7, y: 0, w: 1, h: 1, flip: false });
  return s;
}

const SAVE_KEY = 'lovely-farm-save-v1';

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    return { ...newStateDefaults(), ...s };
  } catch {
    return null;
  }
}

function newStateDefaults(): Partial<GameState> {
  return { stats: {}, achievements: {}, help: {}, giftsSent: {}, gifts: [], storage: {}, cellar: {} };
}

export function saveState(s: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: play without saving */
  }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
