// Localization: Russian (source language), English, German, Azerbaijani.
import { RECIPES, placeInfo } from '../data/items';
import { az, azNames } from './az';
import { de, deNames } from './de';
import { en, enNames } from './en';
import { ru, type Messages, type MsgKey } from './ru';
import { ruNames } from './ru-names';

export type Lang = 'ru' | 'en' | 'de' | 'az';
export type { MsgKey };
export { ruNames };

export const LANGS: { id: Lang; label: string; flag: string; locale: string }[] = [
  { id: 'ru', label: 'Русский', flag: '🇷🇺', locale: 'ru-RU' },
  { id: 'en', label: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { id: 'az', label: 'Azərbaycanca', flag: '🇦🇿', locale: 'az-Latn-AZ' },
];

/** Content names by category: id → display name. */
export interface NameDict {
  crop: Record<string, string>;
  tree: Record<string, string>;
  treeProduct: Record<string, string>;
  animal: Record<string, string>;
  animalProduct: Record<string, string>;
  decor: Record<string, string>;
  building: Record<string, string>;
  buildingAbout: Record<string, string>;
  material: Record<string, string>;
  recipe: Record<string, string>;
  achName: Record<string, string>;
  achVerb: Record<string, string>;
}

export const MESSAGES: Record<Lang, Messages> = { ru, en, de, az };
export const NAMES: Record<Lang, NameDict> = { ru: ruNames, en: enNames, de: deNames, az: azNames };

const STORAGE_KEY = 'lovely-farm-lang';
let lang: Lang = detectLang();
const listeners: ((l: Lang) => void)[] = [];

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in MESSAGES) return saved as Lang;
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'ru').slice(0, 2).toLowerCase();
  return (['ru', 'en', 'de', 'az'] as const).find((l) => l === nav) ?? (nav === 'tr' ? 'az' : nav === 'uk' || nav === 'be' || nav === 'kk' ? 'ru' : 'en');
}

export function getLang() { return lang; }
export function locale() { return LANGS.find((l) => l.id === lang)!.locale; }
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((f) => f(l));
}
export function onLangChange(fn: (l: Lang) => void) { listeners.push(fn); }

export function t(k: MsgKey, params?: Record<string, string | number>): string {
  let s: string = MESSAGES[lang][k] ?? ru[k] ?? k;
  if (params) for (const [p, v] of Object.entries(params)) s = s.split(`{${p}}`).join(String(v));
  return s;
}

/** Translate a server error code. */
export function tErr(code: string): string {
  const k = ('err.' + code) as MsgKey;
  return k in ru ? t(k) : code;
}

export function name(cat: keyof NameDict, id: string): string {
  return NAMES[lang][cat][id] ?? ruNames[cat][id] ?? id;
}

/** Name of a cellar item: crop, fruit, animal product, material or crafted product. */
export function itemName(id: string): string {
  if (id.startsWith('t_')) return name('treeProduct', id.slice(2));
  if (id.startsWith('a_')) return name('animalProduct', id.slice(2));
  if (ruNames.crop[id]) return name('crop', id);
  if (ruNames.material[id]) return name('material', id);
  const r = RECIPES.find((x) => x.output.kind === 'item' && x.output.id === id);
  return r ? name('recipe', r.id) : id;
}

/** Name of a placeable object by key, e.g. 'tree:apple'. */
export function placeName(key: string): string {
  const { kind, id } = placeInfo(key);
  return name(kind === 'tree' ? 'tree' : kind === 'animal' ? 'animal' : kind === 'decor' ? 'decor' : 'building', id);
}

// Cyrillic → Latin transliteration table (lower case).
const CYR: Record<string, string> = Object.fromEntries(
  'а a б b в v г g д d е e ё yo ж zh з z и i й y к k л l м m н n о o п p р r с s т t у u ф f х kh ц ts ч ch ш sh щ shch ъ _ ы y ь _ э e ю yu я ya'
    .split(' ').reduce<[string, string][]>((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1] === '_' ? '' : arr[i + 1]]]), []),
);

/** Village people's names: transliterated for Latin-script languages. */
export function personName(n: string): string {
  if (lang === 'ru') return n;
  return n.replace(/[Ѐ-ӿ]/g, (ch) => {
    const lower = ch.toLowerCase();
    const r = CYR[lower] ?? ch;
    return ch === lower ? r : r.charAt(0).toUpperCase() + r.slice(1);
  });
}
