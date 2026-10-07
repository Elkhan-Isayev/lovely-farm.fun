import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/game';
import { ApiError, type Api } from '../src/net/api';
import { Sync } from '../src/net/sync';

function fakeApi(over: Partial<Api> = {}): Api {
  return {
    save: vi.fn(async () => ({ rev: 2, events: [] })),
    events: vi.fn(async () => ({ events: [] })),
    ...over,
  } as unknown as Api;
}

describe('sync', () => {
  it('saves, acknowledges applied events and applies new ones', async () => {
    const g = new Game(null);
    g.appliedEvents = [5];
    const api = fakeApi({ save: vi.fn(async () => ({ rev: 7, events: [{ id: 9, type: 'gift' as const, fromName: 'A', fromFace: '🙂', key: 'item:wood' }] })) });
    const sync = new Sync(g, api, 1, () => '🙂');
    g.changed();
    expect(sync.dirty).toBe(true);
    await sync.flush();
    expect(api.save).toHaveBeenCalledWith(g.s, 1, [5], 1, '🙂');
    expect(sync.rev).toBe(7);
    expect(g.appliedEvents).toEqual([9]);
    expect(g.s.gifts).toHaveLength(1);
  });

  it('concurrent saves share one request', async () => {
    const g = new Game(null);
    const api = fakeApi();
    const sync = new Sync(g, api, 0, () => '🙂');
    const a = sync.flush(), b = sync.flush();
    expect(a).toBe(b);
    await a;
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('a tab conflict stops syncing', async () => {
    const g = new Game(null);
    const api = fakeApi({ save: vi.fn(async () => { throw new ApiError(409, 'conflict'); }) });
    const sync = new Sync(g, api, 0, () => '🙂');
    const onConflict = vi.fn();
    sync.onConflict = onConflict;
    await sync.flush();
    expect(onConflict).toHaveBeenCalled();
    expect(sync.stopped).toBe(true);
    expect(sync.dirty).toBe(true);
    await sync.flush();
    await sync.poll();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.events).not.toHaveBeenCalled();
  });

  it('other errors are retried later', async () => {
    const g = new Game(null);
    const api = fakeApi({ save: vi.fn(async () => { throw new ApiError(0, 'network'); }), events: vi.fn(async () => { throw new Error('x'); }) });
    const sync = new Sync(g, api, 0, () => '🙂');
    const onError = vi.fn();
    sync.onError = onError;
    await sync.flush();
    await sync.poll();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(sync.stopped).toBe(false);
  });

  it('timers: saves only when dirty, polls events', async () => {
    vi.useFakeTimers();
    const g = new Game(null);
    const api = fakeApi({ events: vi.fn(async () => ({ events: [{ id: 1, type: 'gift' as const, fromName: 'B', fromFace: '🙂', key: 'item:film' }] })) });
    const sync = new Sync(g, api, 0, () => '🙂');
    sync.start(1000, 5000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).not.toHaveBeenCalled();
    g.changed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.events).toHaveBeenCalled();
    expect(g.s.gifts[0].key).toBe('item:film');
    // an applied event must be saved and acknowledged
    expect(api.save).toHaveBeenLastCalledWith(g.s, 2, [1], 1, '🙂');
    sync.stop();
    const saves = (api.save as ReturnType<typeof vi.fn>).mock.calls.length;
    g.changed();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.save).toHaveBeenCalledTimes(saves);
  });

  it('default handlers do nothing', () => {
    const sync = new Sync(new Game(null), fakeApi(), 0, () => '🙂');
    expect(() => { sync.onConflict(); sync.onError(new Error('x')); }).not.toThrow();
  });
});
