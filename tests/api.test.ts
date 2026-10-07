import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../src/net/api';
import { setLang } from '../src/i18n';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe('API client', () => {
  it.each([
    ['register', () => api.register('a', 'b', 'c', 'd'), 'POST', '/api/register', { login: 'a', password: 'b', name: 'c', face: 'd' }],
    ['login', () => api.login('a', 'b'), 'POST', '/api/login', { login: 'a', password: 'b' }],
    ['logout', () => api.logout(), 'POST', '/api/logout', undefined],
    ['me', () => api.me(), 'GET', '/api/me', undefined],
    ['save', () => api.save({} as never, 3, [1], 5, '🙂'), 'PUT', '/api/farm', { state: {}, rev: 3, ack: [1], level: 5, face: '🙂' }],
    ['events', () => api.events(), 'GET', '/api/events', undefined],
    ['friends', () => api.friends(), 'GET', '/api/friends', undefined],
    ['search', () => api.search('\u041b\u0435\u043d\u0430'), 'GET', '/api/users/search?q=%D0%9B%D0%B5%D0%BD%D0%B0', undefined],
    ['request', () => api.request(2), 'POST', '/api/friends/request', { id: 2 }],
    ['accept', () => api.accept(2), 'POST', '/api/friends/accept', { id: 2 }],
    ['remove', () => api.remove(2), 'POST', '/api/friends/remove', { id: 2 }],
    ['farm', () => api.farm(2), 'GET', '/api/farm/2', undefined],
    ['help', () => api.help(2, 1, 1, 'water'), 'POST', '/api/help/2', { x: 1, y: 1, kind: 'water' }],
    ['gift', () => api.gift(2, 'item:wood'), 'POST', '/api/gift/2', { key: 'item:wood' }],
  ])('%s → %s %s', async (_n, call, method, url, body) => {
    const f = mockFetch(200, { ok: true });
    await expect(call()).resolves.toEqual({ ok: true });
    const [u, init] = f.mock.calls[0] as [string, RequestInit];
    expect(u).toBe(url);
    expect(init.method).toBe(method);
    expect(init.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(body);
    expect(init.keepalive).toBe(method === 'PUT');
  });

  it('translates server errors by code', async () => {
    mockFetch(409, { error: 'login_taken' });
    const e = await api.login('a', 'b').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('login_taken');
    expect(e.message).toBe('This login is already taken');
    setLang('de');
    mockFetch(500, undefined);
    const e2 = await api.me().catch((x) => x);
    expect(e2.code).toBe('server');
    expect(e2.message).toBe('Serverfehler');
  });

  it('network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await api.me().catch((x) => x);
    expect(e.status).toBe(0);
    expect(e.message).toBe('No connection to the server');
  });

  it('empty successful response', async () => {
    mockFetch(200, undefined);
    await expect(api.logout()).resolves.toBeNull();
  });
});
