import { describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ANIMALS, BUILDINGS, CROPS, DECOR, MATERIALS, RECIPES, TREES } from '../src/data/items';
import {
  LANGS, MESSAGES, NAMES, detectLang, getLang, itemName, locale, name, onLangChange, personName, placeName,
  ruNames, setLang, t, tErr, type Lang,
} from '../src/i18n';
import { ru } from '../src/i18n/ru';

const langs = LANGS.map((l) => l.id);

describe('localization', () => {
  it('supports RU, EN, DE, AZ', () => {
    expect(langs).toEqual(['ru', 'en', 'de', 'az']);
  });

  it.each(langs)('%s has every key and none is empty', (l) => {
    for (const k of Object.keys(ru)) {
      const v = MESSAGES[l][k as keyof typeof ru];
      expect(v, `${l}: ${k}`).toBeTruthy();
    }
    expect(Object.keys(MESSAGES[l]).sort()).toEqual(Object.keys(ru).sort());
  });

  it.each(langs)('%s keeps every placeholder', (l) => {
    for (const [k, v] of Object.entries(ru)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(MESSAGES[l][k as keyof typeof ru]), `${l}: ${k}`).toEqual(ph(v));
    }
  });

  it.each(langs)('%s translates every content name', (l) => {
    const n = NAMES[l];
    const need: [keyof typeof n, { id: string }[]][] = [
      ['crop', CROPS], ['tree', TREES], ['treeProduct', TREES], ['animal', ANIMALS], ['animalProduct', ANIMALS],
      ['decor', DECOR], ['building', BUILDINGS], ['buildingAbout', BUILDINGS], ['material', MATERIALS], ['recipe', RECIPES],
      ['achName', ACHIEVEMENTS], ['achVerb', ACHIEVEMENTS],
    ];
    for (const [cat, list] of need) for (const { id } of list) expect(n[cat][id], `${l}.${cat}.${id}`).toBeTruthy();
  });

  it('translations really differ from Russian', () => {
    for (const l of ['en', 'de', 'az'] as Lang[]) {
      expect(MESSAGES[l]['nav.cellar']).not.toBe(ru['nav.cellar']);
      expect(NAMES[l].crop.radish).not.toBe(ruNames.crop.radish);
    }
  });

  it('t fills params; language switch persists and notifies', () => {
    const seen: Lang[] = [];
    onLangChange((l) => seen.push(l));
    expect(t('g.needLevel', { n: 5 })).toBe('Requires level 5');
    setLang('en');
    expect(getLang()).toBe('en');
    expect(locale()).toBe('en-GB');
    expect(t('g.needLevel', { n: 5 })).toBe('Requires level 5');
    expect(localStorage.getItem('lovely-farm-lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(detectLang()).toBe('en');
    setLang('de');
    expect(seen.slice(-2)).toEqual(['en', 'de']);
    expect(t('land.now', { s: 8, n: 10 })).toBe('Deine Farm ist 8×8. Erweitern auf 10×10:');
  });

  it('default language comes from the browser', () => {
    localStorage.clear();
    const nav = vi.spyOn(navigator, 'language', 'get');
    nav.mockReturnValue('de-AT');
    expect(detectLang()).toBe('de');
    nav.mockReturnValue('tr-TR');
    expect(detectLang()).toBe('az');
    nav.mockReturnValue('uk-UA');
    expect(detectLang()).toBe('ru');
    nav.mockReturnValue('fr-FR');
    expect(detectLang()).toBe('en');
    localStorage.setItem('lovely-farm-lang', 'xx');
    expect(detectLang()).toBe('en');
  });

  it('works without storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('no'); });
    expect(['ru', 'en', 'de', 'az']).toContain(detectLang());
    expect(() => setLang('az')).not.toThrow();
    expect(getLang()).toBe('az');
    get.mockRestore();
    set.mockRestore();
  });

  it('translates server error codes', () => {
    expect(tErr('login_taken')).toBe('This login is already taken');
    setLang('az');
    expect(tErr('login_taken')).toBe('Bu login artıq tutulub');
    expect(tErr('weird_code')).toBe('weird_code');
  });

  it('item and object names with fallbacks', () => {
    setLang('en');
    expect(itemName('radish')).toBe('Radish');
    expect(itemName('t_apple')).toBe('Apple');
    expect(itemName('a_cow')).toBe('Milk');
    expect(itemName('wood')).toBe('Wood');
    expect(itemName('borscht')).toBe('Borscht');
    expect(itemName('nope')).toBe('nope');
    expect(placeName('tree:apple')).toBe('Apple tree');
    expect(placeName('animal:cow')).toBe('Cow');
    expect(placeName('decor:gnome')).toBe('Garden gnome');
    expect(placeName('building:mill')).toBe('Mill');
    expect(name('crop', 'unknown')).toBe('unknown');
  });

  it('Cyrillic person names are transliterated for Latin scripts', () => {
    // Cyrillic inputs are \u escapes: the repository keeps Russian text only in src/i18n
    setLang('ru');
    expect(personName('\u0411\u0430\u0431\u0430 \u041d\u044e\u0440\u0430')).toBe('\u0411\u0430\u0431\u0430 \u041d\u044e\u0440\u0430');
    setLang('en');
    expect(personName('\u0411\u0430\u0431\u0430 \u041d\u044e\u0440\u0430')).toBe('Baba Nyura');
    expect(personName('\u0429\u0443\u043a\u0430 \u0401\u0436')).toBe('Shchuka Yozh');
    expect(personName('Lena')).toBe('Lena');
  });

  it('a missing key falls back to Russian, then to the key itself', () => {
    setLang('en');
    const saved = MESSAGES.en['nav.shop'];
    delete (MESSAGES.en as Record<string, string>)['nav.shop'];
    expect(t('nav.shop')).toBe(MESSAGES.ru['nav.shop']);
    (MESSAGES.en as Record<string, string>)['nav.shop'] = saved;
    expect(t('missing.key' as never)).toBe('missing.key');
  });
});

describe('villager names', () => {
  it('are English or German, shown the same in every language', async () => {
    const { NPCS } = await import('../src/core/neighbors');
    expect(NPCS.every((n) => /^[A-Za-z ]+$/.test(n.name))).toBe(true);
    for (const l of LANGS) {
      setLang(l.id);
      expect(personName(NPCS[0].name)).toBe(NPCS[0].name);
    }
    setLang('ru');
  });
});
