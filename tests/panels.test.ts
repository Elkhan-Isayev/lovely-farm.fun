import { describe, expect, it, vi } from 'vitest';
import { expForLevel } from '../src/core/levels';
import { HOUR, dayIndex, type FarmObject } from '../src/core/state';
import { getLang } from '../src/i18n';
import { currentModal } from '../src/ui/modal';
import {
  langPicker, openAchievements, openBuilding, openCellar, openDaily, openGiftPicker, openGifts, openLevelUp, openNeighbors,
  openOrders, openPet, openProfile, openSeeds, openShop, openStorage, unlocksAt,
} from '../src/ui/panels';
import { $, $$, clickEl, flush, makeCtx } from './helpers';

const byTitle = (t: string) => $(`.card[data-title="${t}"]`);

describe('seeds and shop', () => {
  it('picks seeds; level-locked ones cannot be picked', () => {
    const { ctx } = makeCtx();
    openSeeds(ctx);
    expect($$('.card')).toHaveLength(37);
    clickEl(byTitle('Orange gerbera'));
    expect(ctx.ctrl.seed).toBe('radish');
    clickEl(byTitle('Tomato'));
    expect(ctx.ctrl.seed).toBe('tomato');
    expect(currentModal()).toBeNull();
  });

  it('all shop tabs; buying a tree enters placement mode', () => {
    const { ctx, game } = makeCtx((s) => { s.exp = expForLevel(6); });
    openShop(ctx);
    clickEl(byTitle('Cherry'));
    expect(ctx.ctrl.placing).toEqual({ key: 'tree:cherry', fromStorage: false });
    expect($('.toast')!.textContent).toContain('Choose a spot');
    for (const tab of ['seeds', 'animals', 'decor', 'buildings', 'materials', 'land', 'trees']) {
      openShop(ctx, tab as never);
      expect($$('.card').length + $$('.modal-body p').length).toBeGreaterThan(0);
    }
    openShop(ctx, 'seeds');
    clickEl(byTitle('Radish'));
    expect(ctx.ctrl.tool).toBe('seed');
    openShop(ctx, 'animals');
    clickEl(byTitle('Cow'));
    expect(ctx.ctrl.placing?.key).toBe('animal:cow');
    openShop(ctx, 'decor');
    clickEl(byTitle('Garden gnome'));
    expect(ctx.ctrl.placing?.key).toBe('decor:gnome');
    openShop(ctx, 'buildings');
    clickEl(byTitle('Mill'));
    expect(ctx.ctrl.placing?.key).toBe('building:mill');
    game.place('building:mill', 3, 3, false);
    openShop(ctx, 'buildings');
    expect(byTitle('Mill').textContent).toContain('already owned');
    openShop(ctx, 'materials');
    clickEl(byTitle('Wood'));
    expect(game.s.cellar.wood).toBe(1);
    expect(byTitle('Wood').textContent).toContain('In cellar: 1');
  });

  it('switches tabs by clicking', () => {
    const { ctx } = makeCtx();
    openShop(ctx);
    clickEl($('[data-tab=animals]'));
    expect(byTitle('Cow')).not.toBeNull();
    openNeighbors(ctx, 'friends');
    clickEl($('[data-tab=village]'));
    expect($('.modal-body').textContent).toContain('Invite');
    clickEl($('[data-tab=friends]'));
    expect($('.modal-body').textContent).toContain('Find friends');
  });

  it('Land tab: every way to expand', () => {
    const { ctx, game } = makeCtx((s) => { s.diamonds = 5; });
    openShop(ctx, 'land');
    clickEl($('[data-expand=gold]'));
    expect(game.s.size).toBe(10);
    expect($('[data-expand=neighbors]').hasAttribute('disabled')).toBe(true);
    clickEl($('[data-expand=diamonds]'));
    expect(game.s.size).toBe(12);
    game.s.neighbors = Array.from({ length: 25 }, (_, i) => 'n' + i);
    openShop(ctx, 'land');
    clickEl($('[data-expand=neighbors]'));
    expect(game.s.size).toBe(14);
    game.s.size = 18;
    openShop(ctx, 'land');
    expect($('.modal-body').textContent).toContain('maximum size');
  });
});

describe('cellar and storage', () => {
  it('sells one, all of an item, and the whole cellar (except materials)', () => {
    const { ctx, game } = makeCtx((s) => { s.gold = 0; s.cellar = { radish: 3, tomato: 1, wood: 2 }; });
    openCellar(ctx);
    expect($$('[data-item]')).toHaveLength(3);
    clickEl($('[data-item=radish] [data-sell="1"]'));
    expect(game.s.gold).toBe(24);
    clickEl($('[data-item=radish] [data-sell=all]'));
    expect(game.s.gold).toBe(72);
    clickEl($('[data-sell-all]'));
    clickEl($('.modal .btn.green'));
    expect(game.s.gold).toBe(112);
    expect(game.s.cellar).toEqual({ wood: 2 });
    game.s.cellar = {};
    openCellar(ctx);
    expect($('.modal-body').textContent).toContain('The cellar is empty');
  });

  it('storage places an item', () => {
    const { ctx } = makeCtx((s) => { s.storage = { 'animal:pig': 2 }; });
    openStorage(ctx);
    clickEl(byTitle('Pig'));
    expect(ctx.ctrl.placing).toEqual({ key: 'animal:pig', fromStorage: true });
    ctx.game.s.storage = {};
    openStorage(ctx);
    expect($('.modal-body').textContent).toContain('Storage is empty');
  });
});

describe('buildings', () => {
  it('mill: start, queue, collect, move to storage', () => {
    const { ctx, game } = makeCtx((s) => { s.exp = expForLevel(6); s.cellar = { corn: 6 }; });
    vi.useFakeTimers({ toFake: ['Date'] });
    game.place('building:mill', 0, 0, false);
    const mill = game.objectAt(0, 0)!;
    openBuilding(ctx, mill);
    expect($('[data-recipe=sunoil]').classList.contains('locked')).toBe(true);
    clickEl($('[data-recipe=cornflour] button'));
    clickEl($('[data-recipe=cornflour] button'));
    expect(mill.jobs).toHaveLength(2);
    expect($$('.q-item')).toHaveLength(2);
    vi.setSystemTime(Date.now() + 2 * HOUR);
    openBuilding(ctx, mill);
    expect($('.q-item.done')).not.toBeNull();
    clickEl($('[data-collect]'));
    expect(game.s.cellar.cornflour).toBe(1);
    vi.setSystemTime(Date.now() + 2 * HOUR);
    openBuilding(ctx, mill);
    clickEl($('[data-collect]'));
    clickEl($('[data-store]'));
    expect(game.s.storage['building:mill']).toBe(1);
  });

  it('the workshop crafts a greenhouse into storage', () => {
    const { ctx, game } = makeCtx((s) => { s.exp = expForLevel(7); s.cellar = { wood: 30, film: 10 }; });
    game.place('building:workshop', 0, 0, false);
    openBuilding(ctx, game.objectAt(0, 0)!);
    expect($('[data-recipe=r_greenhouse]').textContent).toContain('to storage');
    clickEl($('[data-recipe=r_greenhouse] button'));
    expect(game.s.cellar.film).toBeUndefined();
  });

  it('greenhouse: plant, harvest, store', () => {
    const { ctx, game } = makeCtx((s) => { s.storage = { 'building:greenhouse': 1 }; });
    vi.useFakeTimers({ toFake: ['Date'] });
    game.place('building:greenhouse', 0, 0, true);
    const gh = game.objectAt(0, 0) as FarmObject;
    openBuilding(ctx, gh);
    expect($$('.slot.empty')).toHaveLength(12);
    clickEl(byTitle('Radish'));
    expect($$('.slot.empty')).toHaveLength(0);
    vi.setSystemTime(Date.now() + 4 * HOUR);
    openBuilding(ctx, gh);
    expect($$('.slot.done')).toHaveLength(12);
    clickEl($('[data-gh-harvest]'));
    expect(game.s.cellar.radish).toBe(12);
    clickEl($$('.modal .btn.small').at(-1)!);
    expect(game.s.storage['building:greenhouse']).toBe(1);
  });
});

describe('orders', () => {
  it('completing and replacing', () => {
    const { ctx, game } = makeCtx();
    game.fillOrders();
    const first = game.s.orders[0];
    for (const [id, n] of Object.entries(first.items)) game.addItem(id, n);
    openOrders(ctx);
    expect($$('.order')).toHaveLength(3);
    clickEl($(`[data-order="${first.id}"] [data-give]`));
    expect(game.s.orders).not.toContain(first);
    expect(game.s.stats.orders).toBe(1);
    const second = game.s.orders[0];
    clickEl($(`[data-order="${second.id}"] [data-replace]`));
    expect(game.s.orders).not.toContain(second);
    expect($(`[data-order] [data-replace]`).hasAttribute('disabled')).toBe(true);
    game.s.orders[0].from = 'unknown';
    openOrders(ctx);
    expect($('.order-from').textContent).toContain('Neighbour');
  });
});

describe('neighbours and friends', () => {
  it('village: invite, visit, gift', () => {
    const { ctx, game } = makeCtx();
    openNeighbors(ctx, 'village');
    clickEl($('[data-invite=n0] button'));
    expect(game.s.neighbors).toEqual(['n0']);
    clickEl($('[data-npc=n0] [data-gift]'));
    expect(game.s.giftsSent.n0).toBe(dayIndex());
    expect($('[data-npc=n0] [data-gift]').hasAttribute('disabled')).toBe(true);
    clickEl($('[data-npc=n0] [data-visit]'));
    expect(ctx.visitNpc).toHaveBeenCalledWith('n0');
  });

  it('the friends tab starts with the showcase farms, with and without a server', () => {
    for (const online of [true, false]) {
      const { ctx } = makeCtx(undefined, online);
      openNeighbors(ctx, 'friends');
      expect($$('.list-row.showcase')).toHaveLength(3);
      expect($('.showcases').textContent).toContain('Farms for inspiration');
      clickEl($('[data-showcase=blossom] [data-visit]'));
      expect(ctx.visitShowcase).toHaveBeenCalledWith('blossom');
    }
  });

  it('without a server the friends tab explains a connection is needed', () => {
    const { ctx } = makeCtx(undefined, false);
    openNeighbors(ctx, 'friends');
    expect($('.modal-body').textContent).toContain('connected to the server');
    openNeighbors(ctx);
    expect($('.tab.active').getAttribute('data-tab')).toBe('village');
  });

  it('friends: requests, accept, decline, search, befriend, visit, gift, remove', async () => {
    const { ctx, game, api } = makeCtx();
    ctx.incoming = [{ id: 5, login: 'kolya', name: 'Kolya', level: 3, face: '👨' }, { id: 6, login: 'vasya', name: 'Vasya', level: 2, face: '👨' }];
    ctx.outgoing = [{ id: 7, login: 'masha', name: 'Masha', level: 2, face: '👩' }];
    game.friends = [{ id: 8, name: 'Lena', login: 'lena', level: 47, face: '👩', helpLeft: 3, giftSent: false }];
    vi.useFakeTimers();
    openNeighbors(ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.refreshFriends).toHaveBeenCalled();
    expect($('.modal-body').textContent).toContain('@me');
    expect($('.modal-body').textContent).toContain('@masha');
    clickEl($('[data-incoming="5"] [data-accept]'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.accept).toHaveBeenCalledWith(5);
    clickEl($('[data-incoming="6"] [data-decline]'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.remove).toHaveBeenCalledWith(6);

    api.search.mockResolvedValueOnce({ users: [
      { id: 10, login: 'a1', name: 'A', level: 1, face: '🙂', status: null },
      { id: 11, login: 'a2', name: 'B', level: 1, face: '🙂', status: 'pending' },
      { id: 12, login: 'a3', name: 'C', level: 1, face: '🙂', status: 'accepted' },
    ] });
    const input = $<HTMLInputElement>('.modal input.input');
    input.value = 'aa';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(api.search).toHaveBeenCalledWith('aa');
    expect($$('[data-user]')).toHaveLength(3);
    api.request.mockResolvedValueOnce({ ok: true, status: 'accepted' });
    clickEl($('[data-user="10"] [data-add]'));
    await vi.advanceTimersByTimeAsync(0);
    expect($('[data-user="10"]').textContent).toContain('friends now');
    input.value = 'zz';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect($('.search-results').textContent).toContain('Nobody found');
    input.value = 'z';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect($$('[data-user]')).toHaveLength(0);

    clickEl($('[data-friend="8"] [data-visit]'));
    expect(ctx.visitFriend).toHaveBeenCalledWith(game.friends[0]);
    game.social = { help: vi.fn(), gift: vi.fn(async () => ({ ok: true })) };
    clickEl($('[data-friend="8"] [data-gift]'));
    expect($('.modal').getAttribute('aria-label')).toBe('What to give?');
    clickEl($$('.card')[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(game.friends[0].giftSent).toBe(true);

    openNeighbors(ctx);
    await vi.advanceTimersByTimeAsync(0);
    clickEl($('[data-friend="8"] [data-remove]'));
    clickEl($('.modal .btn.green'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.remove).toHaveBeenCalledWith(8);
  });

  it('empty friends list and a plain friend request', async () => {
    const { ctx, api } = makeCtx();
    openNeighbors(ctx);
    expect($('.modal-body').textContent).toContain('No friends yet');
    api.search.mockResolvedValueOnce({ users: [{ id: 3, login: 'x', name: 'X', level: 1, face: '🙂', status: null }] });
    vi.useFakeTimers();
    const input = $<HTMLInputElement>('.modal input.input');
    input.value = 'xx';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    clickEl($('[data-user="3"] [data-add]'));
    await vi.advanceTimersByTimeAsync(0);
    expect($('[data-user="3"]').textContent).toContain('request sent');
  });

  it('picking a gift calls the callback', () => {
    const pick = vi.fn();
    openGiftPicker(pick);
    clickEl($$('.card')[2]);
    expect(pick).toHaveBeenCalledWith('item:nails');
  });

  it('a closed window is not redrawn after the refresh', async () => {
    const { ctx } = makeCtx();
    let resolve!: () => void;
    ctx.refreshFriends = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const m = openNeighbors(ctx);
    m.close();
    resolve();
    await flush();
    expect(currentModal()).toBeNull();
  });

  it('a server refresh does not wipe an ongoing search', async () => {
    const { ctx, game } = makeCtx();
    let resolve!: () => void;
    ctx.refreshFriends = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    openNeighbors(ctx);
    const input = $<HTMLInputElement>('.modal input.input');
    input.value = 'lena';
    game.friends = [{ id: 1, name: 'New friend', login: 'nd', level: 2, face: '🙂', helpLeft: 5, giftSent: false }];
    resolve();
    await flush();
    expect($<HTMLInputElement>('.modal input.input')).toBe(input);
    expect(input.value).toBe('lena');
    expect($('[data-friend="1"]')).not.toBeNull();
  });
});

describe('gifts, achievements, profile, pet', () => {
  it('gifts: accept one, accept all; set and clear a wish', () => {
    const { ctx, game } = makeCtx((s) => { s.gifts = [{ from: 'Lena', key: 'item:wood' }, { from: '\u0411\u0430\u0431\u0430 \u041d\u044e\u0440\u0430', key: 'animal:pig', npc: true }, { from: 'X', key: 'item:film' }]; });
    openGifts(ctx);
    expect($('[data-gift="1"]').textContent).toContain('Baba Nyura'); // a villager's Cyrillic name, transliterated
    clickEl($('[data-gift="0"] button'));
    expect(game.s.cellar.wood).toBe(1);
    clickEl($('[data-accept-all]'));
    expect(game.s.gifts).toEqual([]);
    expect($('.modal-body').textContent).toContain('No new gifts');
    clickEl($('.wishes .card'));
    expect(game.s.wish).toBe('item:wood');
    clickEl($('.wishes .card'));
    expect(game.s.wish).toBeNull();
  });

  it('achievements show progress and completed ones', () => {
    const { ctx } = makeCtx((s) => { s.stats = { dug: 30, harvested: 10_000 }; s.achievements = { dig: 1, harvest: 3 }; });
    openAchievements(ctx);
    expect($('[data-ach=dig]').textContent).toContain('30 / 250');
    expect($('[data-ach=harvest]').textContent).toContain('All tiers completed');
  });

  it('profile: language, gender, colours, speed, logout', () => {
    const { ctx, game } = makeCtx();
    openProfile(ctx);
    clickEl($('[data-gender=boy]'));
    expect(game.s.look.gender).toBe('boy');
    expect($('.look').textContent).toContain('Overalls');
    clickEl($('[data-gender=girl]'));
    clickEl($('[data-color="#e84a5f"]'));
    expect(game.s.look.shirt).toBe('#e84a5f');
    clickEl($('[data-speed="60"]'));
    expect(game.s.clock.speed).toBe(60);
    clickEl($('[data-logout]'));
    expect(ctx.logout).toHaveBeenCalled();
    clickEl($('[data-lang=de]'));
    expect(getLang()).toBe('de');
    expect($('.modal h2').textContent).toBe('Mein Farmer');
    ctx.dev = false;
    ctx.user = null;
    openProfile(ctx);
    expect($('[data-speed]')).toBeNull();
    expect($('[data-logout]')).toBeNull();
  });

  it('language picker without a callback', () => {
    document.body.appendChild(langPicker());
    clickEl($('[data-lang=az]'));
    expect(getLang()).toBe('az');
  });

  it('pet: feeding, petting, renaming', () => {
    const { ctx, game } = makeCtx();
    openPet(ctx);
    expect($('.modal-body').textContent).toContain('is hungry');
    clickEl($('[data-feed]'));
    expect(game.petHappy()).toBe(true);
    expect($('.modal-body').textContent).toContain('is full and happy');
    clickEl($('[data-pet]'));
    expect($('.toast').textContent).toContain('wags his tail');
    // the name: only once, checked, confirmed
    const input = () => $<HTMLInputElement>('[data-pet-name]');
    expect($('.pet-naming').textContent).toContain('only once');
    input().value = 'R';
    clickEl($('[data-pet-save]'));
    expect($('.toast:last-child').textContent).toContain('2 to 16 letters');
    expect($('.modal h2').textContent).toBe('Buddy'); // still the pet's window
    input().value = '  Rex   the  Dog ';
    clickEl($('[data-pet-save]'));
    expect($('.modal-body').textContent).toContain('Name your pet “Rex the Dog”?');
    clickEl($$('.modal button').find((b) => b.textContent === 'Cancel')!);
    expect($('.modal h2').textContent).toBe('Buddy'); // cancelled: back to the pet
    expect(game.s.pet.renamed).toBeFalsy();
    input().value = 'Rex';
    clickEl($('[data-pet-save]'));
    clickEl($$('.modal button').find((b) => b.textContent === 'Name')!);
    expect(game.s.pet.name).toBe('Rex');
    expect(game.s.pet.renamed).toBe(true);
    expect($('.modal h2').textContent).toBe('Rex');
    expect($('[data-pet-name]')).toBeNull(); // no second chance
  });
});

describe('level up and daily bonus', () => {
  it('unlocks per level', () => {
    expect(unlocksAt(5)).toEqual(expect.arrayContaining(['🌱 Carrot', '🐄 Cow', '🔨 Workshop']));
    expect(unlocksAt(99)).toEqual([]);
  });

  it('level-up window', () => {
    openLevelUp(5);
    expect($('.star-big').textContent).toBe('5');
    expect($$('.chip').length).toBeGreaterThan(0);
    clickEl($('.modal .btn.green'));
    expect(currentModal()).toBeNull();
    openLevelUp(99);
    expect($$('.chip')).toHaveLength(0);
  });

  it('daily bonus with and without gifts', () => {
    const { ctx } = makeCtx();
    openDaily(ctx, { bonus: 60, streak: 2, gifts: 3 });
    expect($('.modal-body').textContent).toContain('days in a row: 2');
    clickEl($('[data-open-gifts]'));
    expect($('.modal h2').textContent).toBe('Gifts');
    openDaily(ctx, { bonus: 60, streak: 1, gifts: 0 });
    expect($('[data-open-gifts]')).toBeNull();
    clickEl($('.modal .btn.green'));
    expect(currentModal()).toBeNull();
  });
});
