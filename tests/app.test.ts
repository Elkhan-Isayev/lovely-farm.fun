import { describe, expect, it, vi } from 'vitest';
import { boot, start, type BootEnv } from '../src/app';
import { expForLevel } from '../src/core/levels';
import { dayIndex, newState } from '../src/core/state';
import { setLang } from '../src/i18n';
import { ApiError } from '../src/net/api';
import { currentModal } from '../src/ui/modal';
import { $, $$, clickEl, fakeApi, flush } from './helpers';

const user = { id: 1, login: 'me', name: 'Me', level: 1, face: '👨‍🌾' };

function env(extra: Partial<BootEnv> = {}) {
  const frames: ((t: number) => void)[] = [];
  const e: BootEnv = {
    canvas: document.getElementById('world') as HTMLCanvasElement,
    dev: true,
    raf: (fn) => { frames.push(fn); return frames.length; },
    width: () => 1000,
    height: () => 700,
    reload: vi.fn(),
    ...extra,
  };
  return { e, frames };
}

const existing = () => { const s = newState(); s.lastLoginDay = dayIndex(); return { state: s, rev: 4 }; };

describe('app startup', () => {
  it('shows sign-in without a session and starts the game after signing in', async () => {
    const api = fakeApi();
    api.me.mockRejectedValueOnce(new ApiError(401, 'auth_required'));
    const { e } = env();
    const p = boot(api, e);
    await flush();
    expect($('.auth')).not.toBeNull();
    ($('input[name=login]') as HTMLInputElement).value = 'me';
    ($('input[name=password]') as HTMLInputElement).value = 'secret1';
    $('form').dispatchEvent(new Event('submit', { cancelable: true }));
    const running = await p;
    expect(running).not.toBeNull();
    expect(running!.game.isNew).toBe(true);
    running!.stop();
  });

  it('shows a clear message when the server is down', async () => {
    const api = fakeApi();
    api.me.mockRejectedValueOnce(new ApiError(0, 'network'));
    expect(await boot(api, env().e)).toBeNull();
    expect($('.auth-card').textContent).toContain('The farm server is unavailable');
  });

  it('new player: welcome over the daily bonus, gender from avatar, first save', async () => {
    const api = fakeApi();
    const r = start(api, env().e, user, null, []);
    expect(r.game.s.look.gender).toBe('boy');
    expect($('.modal h2').textContent).toBe('Welcome to your farm!');
    clickEl($('[data-start]'));
    expect(r.game.s.tutorialDone).toBe(true);
    await flush();
    expect(api.save).toHaveBeenCalled();
    expect(api.friends).toHaveBeenCalled();
    expect(r.game.s.orders).toHaveLength(3);
    expect(document.title).toBe('Lovely Farm');
    r.stop();
    const girl = start(fakeApi(), env().e, { ...user, face: '👩' }, null, []);
    expect(girl.game.s.look.gender).toBe('girl');
    girl.stop();
  });

  it('existing farm: applies events, renders frames, updates the HUD', async () => {
    const api = fakeApi();
    const { e, frames } = env();
    const r = start(api, e, user, existing(), [{ id: 3, type: 'gift', fromName: 'Lena', fromFace: '👩', key: 'item:wood' }]);
    expect(currentModal()).toBeNull();
    expect(r.game.s.gifts).toHaveLength(1);
    expect(r.game.appliedEvents).toEqual([3]);
    const tick = vi.spyOn(r.game, 'tick');
    const upd = vi.spyOn(r.hud, 'update');
    frames.shift()!(1000);
    frames.shift()!(1100);
    frames.shift()!(1400);
    frames.shift()!(2600);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(upd).toHaveBeenCalled();
    r.stop();
    frames.shift()?.(3000);
    expect(frames).toHaveLength(0);
  });

  it('daily bonus for a returning player', () => {
    const f = existing();
    f.state.lastLoginDay = 0;
    const r = start(fakeApi(), env().e, user, f, []);
    expect($('.modal h2').textContent).toBe('Welcome back!');
    r.stop();
  });

  it('visits: to a friend (success and failure), to a villager, back home', async () => {
    const api = fakeApi();
    api.farm.mockResolvedValueOnce({
      owner: { ...user, id: 2, helpLeft: 2 },
      farm: { size: 12, plots: {}, objects: [], look: {}, pet: {}, lastTick: Date.now(), savedAt: Date.now() },
    });
    const r = start(api, env().e, user, existing(), []);
    const friend = { id: 2, name: 'Lena', login: 'lena', level: 3, face: '👩', helpLeft: 5, giftSent: false };
    r.renderer.farmer.add({ x: 1, y: 1, tool: 'shovel', key: '1,1', run: () => {} });
    await r.ctx.visitFriend(friend);
    expect(r.game.visit!.farm.size).toBe(12);
    expect(friend.helpLeft).toBe(2);
    expect(r.renderer.farmer.busy()).toBe(false);
    expect(r.ctrl.tool).toBe('hand');
    api.farm.mockRejectedValueOnce(new ApiError(403, 'friends_only'));
    await r.ctx.visitFriend(friend);
    expect($('.toast').textContent).toContain('Only possible with friends');
    r.ctx.visitNpc('n4');
    expect(r.game.visit!.target.type).toBe('npc');
    r.ctx.visitShowcase('estate');
    expect(r.game.visit!.target.type).toBe('showcase');
    expect(r.game.visit!.farm.size).toBe(24);
    r.ctx.goHome();
    expect(r.game.visit).toBeNull();
    r.stop();
  });

  it('refreshes the friends list; network errors do not break the game', async () => {
    const api = fakeApi();
    api.friends.mockResolvedValueOnce({ friends: [{ id: 9, name: 'F', login: 'f', level: 2, face: '🙂', helpLeft: 5, giftSent: false }], incoming: [{ ...user, id: 7 }], outgoing: [] });
    const r = start(api, env().e, user, existing(), []);
    await flush();
    expect(r.game.friends).toHaveLength(1);
    expect(r.ctx.incoming).toHaveLength(1);
    api.friends.mockRejectedValueOnce(new Error('offline'));
    await r.ctx.refreshFriends();
    expect(r.game.friends).toHaveLength(1);
    r.stop();
  });

  it('help and gifts to a friend translate server error codes', async () => {
    const api = fakeApi();
    const r = start(api, env().e, user, existing(), []);
    api.help.mockResolvedValueOnce({ ok: false, left: 0, error: 'help_limit' });
    expect(await r.game.social!.help(2, 1, 1, 'water')).toEqual({ ok: false, left: 0, error: 'You\'ve helped this friend enough for today' });
    expect(await r.game.social!.help(2, 1, 1, 'water')).toEqual({ ok: true, left: 4 });
    api.gift.mockResolvedValueOnce({ ok: false, error: 'gift_done' });
    expect((await r.game.social!.gift(2, 'item:wood')).error).toBe('You already sent this friend a gift today');
    expect(await r.game.social!.gift(2, 'item:wood')).toEqual({ ok: true });
    r.stop();
  });

  it('level up, achievement, language switch, game toasts', () => {
    const r = start(fakeApi(), env().e, user, existing(), []);
    r.game.addExp(expForLevel(2));
    expect($('.modal h2').textContent).toBe('Level up!');
    r.game.stat('dug', 25);
    expect($$('.toast').some((t) => t.textContent!.includes('Digger'))).toBe(true);
    r.game.toast('hello', '👋');
    expect($$('.toast').at(-1)!.textContent).toContain('hello');
    setLang('en');
    expect(document.title).toBe('Lovely Farm');
    r.stop();
  });

  it('logout saves, signs out and reloads', async () => {
    const api = fakeApi();
    const { e } = env();
    const r = start(api, e, user, existing(), []);
    api.logout.mockRejectedValueOnce(new Error('x'));
    await r.ctx.logout();
    expect(api.logout).toHaveBeenCalled();
    expect(e.reload).toHaveBeenCalled();
    r.stop();
  });

  it('tab conflict shows a reload dialog; network error shows a toast', async () => {
    const { e } = env();
    const r = start(fakeApi(), e, user, existing(), []);
    r.sync.onConflict();
    expect($('.modal h2').textContent).toBe('The farm is open in another window');
    clickEl($('[data-reload]'));
    expect(e.reload).toHaveBeenCalled();
    r.sync.onError(new Error('x'));
    expect($$('.toast').at(-1)!.textContent).toContain('No connection');
    r.stop();
  });

  it('leaving the page saves the farmer position; resize resizes the canvas', () => {
    const api = fakeApi();
    const r = start(api, env().e, user, existing(), []);
    r.renderer.farmer.x = 4.5;
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(r.game.s.charPos.x).toBe(4.5);
    r.ctx.visitNpc('n1');
    r.renderer.farmer.x = 9;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(r.game.s.charPos.x).toBe(4.5);
    const resize = vi.spyOn(r.renderer, 'resize');
    window.dispatchEvent(new Event('resize'));
    expect(resize).toHaveBeenCalledWith(1000, 700, 1);
    r.stop();
  });

  it('defaults to window size, requestAnimationFrame and location.reload', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const api = fakeApi();
    const r = start(api, { canvas: document.getElementById('world') as HTMLCanvasElement }, user, existing(), []);
    expect(raf).toHaveBeenCalled();
    expect(r.renderer.w).toBe(window.innerWidth);
    expect(r.ctx.dev).toBe(false);
    r.stop();
  });
});

describe('app sound', () => {
  it('wires game events, the farmer and clicks to the audio; stops it on exit', async () => {
    const { FakeAudioContext } = await import('./helpers');
    const { GameAudio } = await import('../src/audio/audio');
    const c = new FakeAudioContext();
    const audio = new GameAudio(() => c as unknown as AudioContext);
    const play = vi.spyOn(audio, 'play');
    const { e } = env({ audio });
    const r = start(fakeApi(), e, user, existing(), []);
    expect(r.ctx.audio).toBe(audio);
    expect(audio.ctx).toBeNull(); // nothing before a gesture
    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    expect(audio.ctx).not.toBeNull();
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(play).toHaveBeenCalledWith('click');
    r.game.sfx('place');
    expect(play).toHaveBeenCalledWith('place');
    r.game.float(1, 1, '+5', '#fff', '🪙');
    expect(play).toHaveBeenCalledWith('coin');
    r.game.emit('levelup', 3);
    expect(play).toHaveBeenCalledWith('levelup');
    r.game.emit('achievement', { name: 'x', diamonds: 1 });
    expect(play).toHaveBeenCalledWith('sparkle');
    r.renderer.farmer.onAct!('shovel');
    expect(play).toHaveBeenCalledWith('dig');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(c.suspend).toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    r.stop();
    expect(audio.music.playing || audio.ambient!.playing).toBe(false);
  });
});
