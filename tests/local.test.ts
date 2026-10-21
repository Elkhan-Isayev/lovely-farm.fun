// The static build's backend: profile and farm in localStorage, the same interface as the HTTP API.
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/net/api';
import { LOCAL_FARM, LOCAL_USER, localApi } from '../src/net/local';
import { newState } from '../src/core/state';
import { showAuth } from '../src/ui/auth';
import { openProfile } from '../src/ui/panels';
import { $, makeCtx, flush } from './helpers';

const fails = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as ApiError; } throw new Error('expected a failure'); };

describe('localApi', () => {
  it('no profile yet → 401, the start screen creates one', async () => {
    expect(localApi.local).toBe(true);
    expect((await fails(localApi.me())).status).toBe(401);
    expect((await fails(localApi.login('x', 'y'))).status).toBe(401);
    await localApi.register('  Masha  ', '', '  Masha  ', '👩');
    const me = await localApi.me();
    expect(me.user).toMatchObject({ name: 'Masha', face: '👩', level: 1 });
    expect(me.farm).toBeNull();
    expect(me.events).toEqual([]);
    expect(await localApi.login('x', 'y')).toEqual({ ok: true });
    expect(await localApi.logout()).toEqual({ ok: true });
    await localApi.register('', '', '', '👨');
    expect((await localApi.me()).user.name).toBe('Farmer'); // the default name in the current language
  });

  it('saves the farm with revisions; another tab saving first is a conflict', async () => {
    await localApi.register('Lena', '', 'Lena', '👩');
    const s = newState();
    s.gold = 777;
    expect(await localApi.save(s, 0, [], 3, '👧')).toEqual({ rev: 1, events: [] });
    const me = await localApi.me();
    expect(me.farm!.state.gold).toBe(777);
    expect(me.farm!.rev).toBe(1);
    expect(me.user).toMatchObject({ level: 3, face: '👧' }); // level and avatar follow the farm
    expect((await fails(localApi.save(s, 0, [], 3, '👧'))).status).toBe(409); // stale revision
    expect((await localApi.save(s, 1, [], 3, '👧')).rev).toBe(2);
  });

  it('a full browser storage is reported, broken data is treated as missing', async () => {
    await localApi.register('Lena', '', 'Lena', '👩');
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const e = await fails(localApi.save(newState(), 0, [], 1, '👩'));
    expect(e.status).toBe(507);
    expect(e.message).toBe('Could not save: the browser is out of storage space');
    set.mockRestore();
    localStorage.setItem(LOCAL_USER, '{broken');
    expect((await fails(localApi.me())).status).toBe(401);
    localStorage.setItem(LOCAL_FARM, 'null');
    await localApi.register('A', '', 'A', '👩');
    await localApi.save(newState(), 0, [], 1, '👩');
    localStorage.removeItem(LOCAL_USER);
    expect((await localApi.save(newState(), 1, [], 1, '👩')).rev).toBe(2); // no profile to update: still saves
  });

  it('no other players without a server', async () => {
    expect(await localApi.events()).toEqual({ events: [] });
    expect(await localApi.friends()).toEqual({ friends: [], incoming: [], outgoing: [] });
    expect(await localApi.search('x')).toEqual({ users: [] });
    for (const call of [localApi.request(1), localApi.accept(1), localApi.remove(1), localApi.farm(1), localApi.help(1, 0, 0, 'water'), localApi.gift(1, 'item:wood')]) {
      expect((await fails(call)).code).toBe('network');
    }
  });
});

describe('static build UI', () => {
  it('the start screen asks only for a name and an avatar', async () => {
    let done = 0;
    showAuth(localApi, () => done++);
    expect($('input[name=password]')).toBeNull();
    expect($('[data-switch]')).toBeNull();
    expect($('[data-local-hint]')).not.toBeNull();
    expect($('button[type=submit]').textContent).toBe('Play');
    ($('input[name=name]') as HTMLInputElement).value = 'Pages Player';
    $('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(done).toBe(1);
    expect((await localApi.me()).user.name).toBe('Pages Player');
  });

  it('the profile shows where the progress lives instead of a log-out button', () => {
    const { ctx } = makeCtx(undefined, false);
    openProfile(ctx);
    expect($('[data-logout]')).toBeNull();
    expect($('.modal [data-local-hint]')).not.toBeNull();
  });
});
