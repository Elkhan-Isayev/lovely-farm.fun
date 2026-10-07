import { describe, expect, it, vi } from 'vitest';
import { HOUR, type FarmObject } from '../src/core/state';
import { SHOWCASES } from '../src/core/showcase';
import { NPCS } from '../src/core/neighbors';
import { setLang } from '../src/i18n';
import { Hud } from '../src/ui/hud';
import { $, $$, clickEl, makeCtx } from './helpers';

function mk(mod?: Parameters<typeof makeCtx>[0]) {
  const r = makeCtx(mod);
  const hud = new Hud(r.ctx);
  return { ...r, hud };
}

describe('HUD', () => {
  it('music and sound switches', async () => {
    const { GameAudio } = await import('../src/audio/audio');
    const { FakeAudioContext } = await import('./helpers');
    const r = makeCtx();
    const c = new FakeAudioContext();
    const { Music } = await import('../src/audio/music');
    const fakeTrack = (src: string) => ({ src, volume: 1, play: async () => {}, pause: () => {}, addEventListener: () => {} });
    r.ctx.audio = new GameAudio(() => c as unknown as AudioContext, new Music(['a.mp3'], 0.3, fakeTrack));
    const hud = new Hud(r.ctx);
    hud.update();
    expect($('[data-sound=music]').classList.contains('off')).toBe(false);
    clickEl($('[data-sound=music]'));
    hud.update();
    expect(r.ctx.audio.settings.music).toBe(false);
    expect($('[data-sound=music]').classList.contains('off')).toBe(true);
    clickEl($('[data-sound=sfx]'));
    hud.update();
    expect($('[data-sound=sfx]').textContent).toContain('🔇');
    expect(r.ctx.audio.ambient!.playing).toBe(false);
    // no tracks: only the sounds switch
    r.ctx.audio = new GameAudio(() => c as unknown as AudioContext, new Music([]));
    hud.update();
    expect($('[data-sound=music]')).toBeNull();
    expect($('[data-sound=sfx]')).not.toBeNull();
    // without audio there are no switches
    delete r.ctx.audio;
    hud.update();
    expect($('[data-sound]')).toBeNull();
  });

  it('top bar: level, XP, money, badges', () => {
    const { hud, game, ctx } = mk((s) => { s.gold = 1234; s.diamonds = 2.5; s.gifts = [{ from: 'a', key: 'item:wood' }]; });
    expect($('.lvl-star').textContent).toBe('1');
    expect($('.me-name').textContent).toBe('Me');
    expect($('[data-gold]').textContent).toContain('1 234');
    expect($('[data-gems]').textContent).toContain('2.5');
    expect($$('.badge')).toHaveLength(1);
    game.fillOrders();
    for (const [id, n] of Object.entries(game.s.orders[0].items)) game.addItem(id, n);
    ctx.user = null;
    hud.update();
    expect($$('.badge')).toHaveLength(2);
    expect($('.me-name').textContent).toBe('Farmer');
    clickEl($('.me'));
    expect($('.modal h2').textContent).toBe('My farmer');
    for (const [i, title] of ['Orders', 'Gifts', 'Achievements'].entries()) {
      clickEl($$('.round')[i]);
      expect($('.modal h2').textContent).toBe(title);
    }
  });

  it('tools switch, seeds open a window, navigation buttons', () => {
    const { ctx } = mk();
    clickEl($('[data-tool=shovel]'));
    expect(ctx.ctrl.tool).toBe('shovel');
    expect($('[data-tool=shovel]').classList.contains('active')).toBe(true);
    clickEl($('[data-tool=seed]'));
    expect($('.modal h2').textContent).toBe('Seeds');
    for (const [nav, title] of [['shop', 'Shop'], ['cellar', 'Cellar'], ['storage', 'Storage']]) {
      clickEl($(`[data-nav=${nav}]`));
      expect($('.modal h2').textContent).toBe(title);
    }
  });

  it('hint bar while placing, moving and storing; the Done button', () => {
    const { ctx } = mk();
    expect($('.hint-bar').classList.contains('hidden')).toBe(true);
    ctx.ctrl.startPlacing('tree:cherry', false);
    expect($('.hint-bar').textContent).toContain('Placing: Cherry');
    expect($('[data-tool=hand]').classList.contains('active')).toBe(true);
    ctx.ctrl.setTool('move');
    expect($('.hint-bar').textContent).toContain('Choose what to move');
    ctx.ctrl.moving = { id: 1, key: 'decor:gnome', x: 0, y: 0, w: 1, h: 1, flip: false };
    ctx.ctrl.onChange(() => {});
    ctx.ctrl.setTool('store');
    expect($('.hint-bar').textContent).toContain('put it into storage');
    ctx.ctrl.tool = 'move';
    ctx.ctrl.moving = { id: 1, key: 'decor:gnome', x: 0, y: 0, w: 1, h: 1, flip: false };
    (ctx.ctrl as unknown as { changed: () => void }).changed();
    expect($('.hint-bar').textContent).toContain('Moving: Garden gnome');
    clickEl($('.hint-bar button'));
    expect(ctx.ctrl.tool).toBe('hand');
  });

  it('neighbour strip and visit banner', () => {
    const { ctx, game, hud } = mk((s) => { s.neighbors = ['n0']; });
    game.friends = [{ id: 3, name: 'Lena', login: 'lena', level: 9, face: '👩', helpLeft: 5, giftSent: false }];
    ctx.incoming = [{ id: 4, login: 'x', name: 'X', level: 1, face: '🙂' }];
    hud.update();
    expect($$('.nb')).toHaveLength(6); // 3 showcase farms + friend + villager + "add"
    expect($$('.nb')[0].dataset.showcase).toBe('estate');
    expect($('.nb.add').textContent).toContain('Requests: 1');
    clickEl($('[data-showcase=tropic]'));
    expect(ctx.visitShowcase).toHaveBeenCalledWith('tropic');
    clickEl($('.nb.friend'));
    expect(ctx.visitFriend).toHaveBeenCalled();
    clickEl($('[data-npc=n0]'));
    expect(ctx.visitNpc).toHaveBeenCalledWith('n0');
    clickEl($('.nb.add'));
    expect($('.modal h2').textContent).toBe('Neighbours');

    game.startVisit({ type: 'npc', npc: NPCS[0] });
    hud.update();
    expect($('.toolbar').classList.contains('hidden')).toBe(true);
    expect($$('.nb')).toHaveLength(0);
    expect($('.banner').textContent).toContain('Farm: ' + NPCS[0].name);
    clickEl($('[data-home]'));
    expect(ctx.goHome).toHaveBeenCalled();
    game.startVisit({ type: 'friend', friend: game.friends[0] }, { size: 8, plots: {}, objects: [], growStage: {} });
    hud.update();
    expect($('.banner').textContent).toContain('level 9');
    game.startVisit({ type: 'showcase', showcase: SHOWCASES[1] });
    hud.update();
    expect($('.banner').textContent).toContain('Farm: Blossom Garden');
    expect($('.banner').textContent).toContain('Rings of flowers');
    game.endVisit();
    hud.update();
    expect($('.banner').classList.contains('hidden')).toBe(true);
  });

  it('tooltip text for everything on the farm', () => {
    const { hud, game } = mk();
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = game.now();
    const tree: FarmObject = { id: 1, key: 'tree:cherry', x: 0, y: 0, w: 1, h: 1, flip: false, readyAt: now + HOUR };
    const cow: FarmObject = { id: 2, key: 'animal:cow', x: 0, y: 0, w: 2, h: 2, flip: false, readyAt: now - 1 };
    const gnome: FarmObject = { id: 3, key: 'decor:gnome', x: 0, y: 0, w: 1, h: 1, flip: false };
    expect(hud.tipText(null, 'pet')).toBe('Buddy');
    expect(hud.tipText(null, 'house')).toBe('My house');
    expect(hud.tipText(null, tree)).toBe('Cherry: Cherries in 1 h');
    expect(hud.tipText(null, cow)).toBe('Cow: Milk — ready to collect!');
    expect(hud.tipText(null, { ...tree, readyAt: undefined })).toContain('ready to collect');
    expect(hud.tipText(null, gnome)).toBe('Garden gnome');
    expect(hud.tipText(null, null)).toBe('');
    expect(hud.tipText({ x: 9, y: 9 }, null)).toBe('');
    const P = game.s.plots;
    P['1,1'] = { state: 'soil', growth: 0, watered: false, fertilized: false, pest: null };
    P['1,2'] = { state: 'withered', crop: 'radish', growth: -1, watered: false, fertilized: false, pest: null };
    P['1,3'] = { state: 'withered', crop: 'radish', growth: 9, watered: false, fertilized: false, pest: null };
    P['1,4'] = { state: 'growing', crop: 'radish', growth: 4 * HOUR, watered: true, fertilized: false, pest: null };
    P['1,5'] = { state: 'growing', crop: 'radish', growth: HOUR, watered: false, fertilized: false, pest: 'crow' };
    P['1,6'] = { state: 'growing', crop: 'radish', growth: HOUR, watered: true, fertilized: false, pest: 'toad' };
    P['1,7'] = { state: 'growing', crop: 'radish', growth: HOUR, watered: true, fertilized: false, pest: null };
    expect(hud.tipText({ x: 1, y: 1 }, null)).toContain('ready for planting');
    expect(hud.tipText({ x: 1, y: 2 }, null)).toContain('Harvested');
    expect(hud.tipText({ x: 1, y: 3 }, null)).toContain('Withered');
    expect(hud.tipText({ x: 1, y: 4 }, null)).toBe('Radish: ripe! Withers in 4 h');
    expect(hud.tipText({ x: 1, y: 5 }, null)).toBe('Radish: 3 h left · 🐦‍⬛ crow!, 💧 needs water');
    expect(hud.tipText({ x: 1, y: 6 }, null)).toContain('🐸 toad!');
    expect(hud.tipText({ x: 1, y: 7 }, null)).toBe('Radish: 3 h left');
    game.startVisit({ type: 'npc', npc: NPCS[0] });
    const k = Object.keys(game.visit!.farm.plots)[0].split(',').map(Number);
    expect(hud.tipText({ x: k[0], y: k[1] }, null)).not.toBe('');
  });

  it('tooltip shows and hides; language changes labels', () => {
    const { hud } = mk();
    hud.tooltip(10, 20, null, 'house');
    expect($('.tip').classList.contains('hidden')).toBe(false);
    expect($('.tip').style.transform).toBe('translate(26px, 32px)');
    hud.tooltip(0, 0, null, null);
    expect($('.tip').classList.contains('hidden')).toBe(true);
    setLang('az');
    hud.update();
    expect($('[data-nav=cellar]').textContent).toContain('Zirzəmi');
  });
});
