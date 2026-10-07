// @vitest-environment node
// Server integration tests: real HTTP and a real SQLite database in a temp folder.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { checkPassword, createApp, hashPassword, HELP_LIMIT } from '../server/app.ts';
import { openDb } from '../server/db.ts';

const dir = mkdtempSync(join(tmpdir(), 'farm-test-'));
const staticDir = join(dir, 'dist');
mkdirSync(join(staticDir, 'assets'), { recursive: true });
writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>farm</title>');
writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(staticDir, 'weird.xyz'), 'x');
mkdirSync(join(staticDir, 'audio'), { recursive: true });
writeFileSync(join(staticDir, 'audio', 'song.mp3'), Buffer.from('0123456789'));

let clock = Date.UTC(2026, 9, 4, 9);
let db: DatabaseSync;
let app: ReturnType<typeof createApp>;
let server: Server;
let base = '';

beforeAll(async () => {
  db = openDb(join(dir, 'db', 'farm.sqlite'));
  app = createApp({ db, staticDir, now: () => clock, rateLimit: 1000 });
  server = createServer(app.handle);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A client with its own cookie session. */
function client(ip = '1.1.1.1') {
  let cookie = '';
  const req = async (method: string, path: string, body?: unknown, raw?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie, 'x-forwarded-for': ip },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, data, headers: res.headers };
  };
  return { req, get cookie() { return cookie; } };
}

let n = 0;
async function user(name?: string) {
  const c = client();
  const login = `user${++n}`;
  const r = await c.req('POST', '/api/register', { login, password: 'secret1', name: name ?? login, face: '👨‍🌾' });
  expect(r.status).toBe(200);
  const me = await c.req('GET', '/api/me');
  return { c, id: me.data.user.id as number, login };
}

async function befriend(a: Awaited<ReturnType<typeof user>>, b: Awaited<ReturnType<typeof user>>) {
  await a.c.req('POST', '/api/friends/request', { id: b.id });
  await b.c.req('POST', '/api/friends/accept', { id: a.id });
}

const farmState = (plots: Record<string, unknown> = {}) => ({ size: 8, plots, objects: [], look: {}, pet: {}, lastTick: 1, clock: { game: 1 } });

describe('passwords', () => {
  it('salted scrypt and verification', () => {
    const h1 = hashPassword('abc'), h2 = hashPassword('abc');
    expect(h1).not.toBe(h2);
    expect(checkPassword('abc', h1)).toBe(true);
    expect(checkPassword('abd', h1)).toBe(false);
  });
});

describe('sign-up and sign-in', () => {
  it('sign-up creates a session; sign-in and logout work', async () => {
    const c = client();
    const r = await c.req('POST', '/api/register', { login: '\u0410\u043b\u0451\u043d\u0430_1', password: 'secret1', name: '  \u0410\u043b\u0451\u043d\u0430  ' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/);
    const me = await c.req('GET', '/api/me');
    expect(me.data.user).toMatchObject({ login: '\u0410\u043b\u0451\u043d\u0430_1', name: '\u0410\u043b\u0451\u043d\u0430', level: 1, face: '👩‍🌾' });
    expect(me.data.farm).toBeNull();
    expect(me.data.events).toEqual([]);
    await c.req('POST', '/api/logout');
    expect((await c.req('GET', '/api/me')).status).toBe(401);
    expect((await c.req('POST', '/api/login', { login: '\u0430\u043b\u0451\u043d\u0430_1', password: 'secret1' })).status).toBe(200);
    expect((await c.req('GET', '/api/me')).status).toBe(200);
  });

  it.each([
    [{ login: 'ab', password: 'secret1' }, 'bad_login'],
    [{ login: 'a b c', password: 'secret1' }, 'bad_login'],
    [{ login: 12345, password: 'secret1' }, 'bad_login'],
    [{ login: 'okname', password: '123' }, 'bad_password'],
  ])('validation %j → %s', async (body, code) => {
    const r = await client().req('POST', '/api/register', body);
    expect(r.status).toBe(400);
    expect(r.data.error).toBe(code);
  });

  it('accepts Latin letters with diacritics (e.g. Azerbaijani) in logins', async () => {
    const r = await client().req('POST', '/api/register', { login: 'Əli_çay', password: 'secret1' });
    expect(r.status).toBe(200);
  });

  it('login taken case-insensitively; wrong password', async () => {
    const c = client();
    await c.req('POST', '/api/register', { login: 'Dup', password: 'secret1' });
    const r = await c.req('POST', '/api/register', { login: 'dup', password: 'secret1' });
    expect(r).toMatchObject({ status: 409, data: { error: 'login_taken' } });
    expect((await c.req('POST', '/api/login', { login: 'dup', password: 'nope' })).data.error).toBe('wrong_credentials');
    // Cyrillic: letter case and yo/ye do not create look-alike accounts
    await c.req('POST', '/api/register', { login: '\u0410\u043b\u0451\u0448\u0430', password: 'secret1' });
    expect((await c.req('POST', '/api/register', { login: '\u0410\u041b\u0415\u0428\u0410', password: 'secret1' })).data.error).toBe('login_taken');
    expect((await c.req('POST', '/api/login', { login: '\u0430\u043b\u0435\u0448\u0430', password: 'secret1' })).status).toBe(200);
    expect((await c.req('POST', '/api/login', {})).status).toBe(401);
  });

  it('logout without a session and with a foreign cookie', async () => {
    expect((await client().req('POST', '/api/logout')).status).toBe(200);
    const res = await fetch(base + '/api/me', { headers: { cookie: 'sid=bogus; other=1; broken' } });
    expect(res.status).toBe(401);
  });

  it('sessions expire', async () => {
    const { c } = await user();
    clock += 61 * 86_400_000;
    expect((await c.req('GET', '/api/me')).status).toBe(401);
    app.cleanup();
    expect((db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires < ?').get(clock) as { n: number }).n).toBe(0);
  });
});

describe('farm', () => {
  it('saving, revisions and second-tab protection', async () => {
    const { c } = await user();
    const s1 = await c.req('PUT', '/api/farm', { state: farmState(), rev: 0, level: 7, face: '🧔' });
    expect(s1.data).toEqual({ rev: 1, events: [] });
    const s2 = await c.req('PUT', '/api/farm', { state: farmState(), rev: 1, level: 'x' });
    expect(s2.data.rev).toBe(2);
    const stale = await c.req('PUT', '/api/farm', { state: farmState(), rev: 1 });
    expect(stale).toMatchObject({ status: 409, data: { error: 'conflict' } });
    const me = await c.req('GET', '/api/me');
    expect(me.data.farm.rev).toBe(2);
    expect(me.data.user).toMatchObject({ level: 1, face: '🧔' });
    expect((await c.req('PUT', '/api/farm', { rev: 2 })).data.error).toBe('no_state');
  });

  it('401 without a session, 400 on bad JSON, 413 on a huge body', async () => {
    expect((await client().req('PUT', '/api/farm', { state: {} })).status).toBe(401);
    const { c } = await user();
    expect((await c.req('PUT', '/api/farm', undefined, '{bad')).data.error).toBe('bad_json');
    const big = await c.req('PUT', '/api/farm', undefined, '"' + 'x'.repeat(3_100_000) + '"').catch(() => ({ status: 413 }));
    expect(big.status).toBe(413);
    // after the rejection the connection is closed and later requests work
    expect((await c.req('GET', '/api/me')).status).toBe(200);
  });
});

describe('friendships', () => {
  it('case-insensitive Cyrillic search, statuses, requests', async () => {
    const a = await user('\u041b\u0435\u043d\u0430 \u041f\u0435\u0442\u0440\u043e\u0432\u0430');
    const b = await user('\u041a\u043e\u043b\u044f');
    const found = await b.c.req('GET', '/api/users/search?q=' + encodeURIComponent('\u043b\u0415\u041d\u0430'));
    expect(found.data.users.map((u: { id: number }) => u.id)).toContain(a.id);
    expect(found.data.users[0].status).toBeNull();
    expect((await b.c.req('GET', '/api/users/search?q=a')).data.users).toEqual([]);
    expect((await b.c.req('GET', '/api/users/search')).data.users).toEqual([]);

    expect((await b.c.req('POST', '/api/friends/request', { id: a.id })).data.status).toBe('pending');
    const bl = await b.c.req('GET', '/api/friends');
    expect(bl.data.outgoing.map((u: { id: number }) => u.id)).toEqual([a.id]);
    const al = await a.c.req('GET', '/api/friends');
    expect(al.data.incoming.map((u: { id: number }) => u.id)).toEqual([b.id]);
    // a counter-request means acceptance
    expect((await a.c.req('POST', '/api/friends/request', { id: b.id })).data.status).toBe('accepted');
    const fl = await a.c.req('GET', '/api/friends');
    expect(fl.data.friends[0]).toMatchObject({ id: b.id, helpLeft: HELP_LIMIT, giftSent: false });
    const again = await b.c.req('GET', '/api/users/search?q=' + encodeURIComponent('\u041b\u0435\u043d\u0430'));
    expect(again.data.users.find((u: { id: number }) => u.id === a.id).status).toBe('accepted');
    await a.c.req('POST', '/api/friends/remove', { id: b.id });
    expect((await a.c.req('GET', '/api/friends')).data.friends).toEqual([]);
  });

  it('cannot befriend yourself or a missing user', async () => {
    const a = await user();
    expect((await a.c.req('POST', '/api/friends/request', { id: a.id })).data.error).toBe('user_not_found');
    expect((await a.c.req('POST', '/api/friends/request', { id: 99999 })).status).toBe(404);
    expect((await a.c.req('POST', '/api/friends/request', {})).status).toBe(404);
  });

  it('accepting requests and sorting friends by level', async () => {
    const a = await user(), b = await user(), c = await user();
    await b.c.req('PUT', '/api/farm', { state: farmState(), rev: 0, level: 3 });
    await c.c.req('PUT', '/api/farm', { state: farmState(), rev: 0, level: 9 });
    await befriend(b, a);
    await befriend(c, a);
    const l = await a.c.req('GET', '/api/friends');
    expect(l.data.friends.map((f: { id: number }) => f.id)).toEqual([c.id, b.id]);
  });
});

describe('visits, help and gifts', () => {
  it('a farm is visible to friends only; undelivered help is overlaid', async () => {
    const owner = await user(), guest = await user(), stranger = await user();
    expect((await guest.c.req('GET', `/api/farm/${owner.id}`)).data.error).toBe('friends_only');
    await befriend(guest, owner);
    expect((await guest.c.req('GET', `/api/farm/${owner.id}`)).data.error).toBe('farm_missing');
    await owner.c.req('PUT', '/api/farm', {
      state: farmState({ '1,1': { state: 'growing', crop: 'radish', growth: 0, watered: false, pest: 'crow' }, '2,2': { state: 'growing', crop: 'radish', growth: 0, watered: false, pest: null } }),
      rev: 0,
    });
    const help1 = await guest.c.req('POST', `/api/help/${owner.id}`, { x: 1, y: 1, kind: 'chase' });
    expect(help1.data).toEqual({ ok: true, left: HELP_LIMIT - 1 });
    await guest.c.req('POST', `/api/help/${owner.id}`, { x: 2, y: 2, kind: 'water' });
    const view = await guest.c.req('GET', `/api/farm/${owner.id}`);
    expect(view.data.owner).toMatchObject({ id: owner.id, helpLeft: HELP_LIMIT - 2 });
    expect(view.data.farm.plots['1,1'].pest).toBeNull();
    expect(view.data.farm.plots['2,2'].watered).toBe(true);
    expect(view.data.farm.savedAt).toBe(1);
    expect((await stranger.c.req('POST', `/api/help/${owner.id}`, { x: 1, y: 1, kind: 'chase' })).status).toBe(403);

    // the owner receives events and acknowledges them by saving
    const me = await owner.c.req('GET', '/api/me');
    expect(me.data.events.map((e: { kind: string }) => e.kind)).toEqual(['chase', 'water']);
    expect(me.data.events[0]).toMatchObject({ type: 'help', x: 1, y: 1, fromName: guest.login });
    const ids = me.data.events.map((e: { id: number }) => e.id);
    const saved = await owner.c.req('PUT', '/api/farm', { state: farmState(), rev: 1, ack: ids });
    expect(saved.data.events).toEqual([]);
    expect((await owner.c.req('GET', '/api/events')).data.events).toEqual([]);
  });

  it('help rules: format, duplicates, not needed, daily limit', async () => {
    const owner = await user(), guest = await user();
    await befriend(guest, owner);
    const plots: Record<string, unknown> = { '0,0': { state: 'soil' } };
    for (let i = 1; i <= 8; i++) plots[`${i},0`] = { state: 'growing', crop: 'radish', growth: 0, watered: false, pest: null };
    await owner.c.req('PUT', '/api/farm', { state: farmState(plots), rev: 0 });
    const h = (body: unknown) => guest.c.req('POST', `/api/help/${owner.id}`, body);
    expect((await h({ x: 'a', y: 0, kind: 'chase' })).data.error).toBe('bad_help');
    expect((await h({ x: 1, y: 0, kind: 'dance' })).data.error).toBe('bad_help');
    expect((await h({ x: 0, y: 0, kind: 'water' })).data).toMatchObject({ ok: false, error: 'help_not_needed' });
    expect((await h({ x: 1, y: 0, kind: 'water' })).data.ok).toBe(true);
    expect((await h({ x: 1, y: 0, kind: 'water' })).data).toMatchObject({ ok: false, error: 'help_done' });
    for (let i = 2; i <= HELP_LIMIT; i++) expect((await h({ x: i, y: 0, kind: 'water' })).data.ok).toBe(true);
    expect((await h({ x: 7, y: 0, kind: 'water' })).data).toEqual({ ok: false, left: 0, error: 'help_limit' });
    // the limit resets the next day
    clock += 86_400_000;
    expect((await h({ x: 7, y: 0, kind: 'water' })).data.ok).toBe(true);
  });

  it('gifts: friends only, whitelisted only, once a day', async () => {
    const a = await user(), b = await user();
    expect((await a.c.req('POST', `/api/gift/${b.id}`, { key: 'item:wood' })).status).toBe(403);
    await befriend(a, b);
    expect((await a.c.req('POST', `/api/gift/${b.id}`, { key: 'item:diamonds' })).data.error).toBe('bad_gift');
    expect((await a.c.req('POST', `/api/gift/${b.id}`, {})).data.error).toBe('bad_gift');
    expect((await a.c.req('POST', `/api/gift/${b.id}`, { key: 'animal:pig' })).data.ok).toBe(true);
    expect((await a.c.req('POST', `/api/gift/${b.id}`, { key: 'item:wood' })).data).toEqual({ ok: false, error: 'gift_done' });
    expect((await a.c.req('GET', '/api/friends')).data.friends[0].giftSent).toBe(true);
    const ev = await b.c.req('GET', '/api/events');
    expect(ev.data.events[0]).toMatchObject({ type: 'gift', key: 'animal:pig' });
  });

  it('cleanup of old logs and delivered events', async () => {
    const a = await user(), b = await user();
    await befriend(a, b);
    await a.c.req('POST', `/api/gift/${b.id}`, { key: 'item:wood' });
    const ev = await b.c.req('GET', '/api/events');
    await b.c.req('PUT', '/api/farm', { state: farmState(), rev: 0, ack: [ev.data.events[0].id] });
    clock += 8 * 86_400_000;
    app.cleanup();
    expect((db.prepare('SELECT COUNT(*) n FROM gift_log WHERE sender = ?').get(a.id) as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) n FROM events WHERE user_id = ?').get(b.id) as { n: number }).n).toBe(0);
  });
});

describe('static files and misc', () => {
  it('index, long-cached assets, SPA fallback, unknown type', async () => {
    const root = await fetch(base + '/');
    expect(root.headers.get('content-type')).toContain('text/html');
    expect(await root.text()).toContain('farm');
    const js = await fetch(base + '/assets/app.js');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(js.headers.get('content-type')).toContain('javascript');
    const spa = await fetch(base + '/some/page');
    expect(await spa.text()).toContain('farm');
    const odd = await fetch(base + '/weird.xyz');
    expect(odd.headers.get('content-type')).toBe('application/octet-stream');
    expect((await fetch(base + '/', { method: 'HEAD' })).status).toBe(200);
  });

  it('music: audio type, byte ranges for streaming and seeking, 404 for a missing file', async () => {
    const full = await fetch(base + '/audio/song.mp3');
    expect(full.headers.get('content-type')).toBe('audio/mpeg');
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(full.headers.get('content-length')).toBe('10');
    const part = await fetch(base + '/audio/song.mp3', { headers: { Range: 'bytes=2-5' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await part.text()).toBe('2345');
    const open = await fetch(base + '/audio/song.mp3', { headers: { Range: 'bytes=7-' } });
    expect(await open.text()).toBe('789');
    const tail = await fetch(base + '/audio/song.mp3', { headers: { Range: 'bytes=-3' } });
    expect(await tail.text()).toBe('789');
    const past = await fetch(base + '/audio/song.mp3', { headers: { Range: 'bytes=4-99' } });
    expect(past.headers.get('content-range')).toBe('bytes 4-9/10');
    const bad = await fetch(base + '/audio/song.mp3', { headers: { Range: 'bytes=20-' } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toBe('bytes */10');
    expect((await fetch(base + '/audio/song.mp3', { headers: { Range: 'bytes=5-2' } })).status).toBe(416);
    expect((await fetch(base + '/audio/song.mp3', { headers: { Range: 'items=1-2' } })).status).toBe(200); // not bytes: the whole file
    expect((await fetch(base + '/audio/missing.mp3')).status).toBe(404);
  });

  it('path traversal is blocked', async () => {
    const res = await fetch(base + '/%2e%2e/%2e%2e/etc/passwd');
    expect([403, 200]).toContain(res.status);
    if (res.status === 200) expect(await res.text()).toContain('farm');
  });

  it('unbuilt client, unknown API method, POST to static', async () => {
    const bare = createApp({ db, staticDir: join(dir, 'nope') });
    const s = createServer(bare.handle);
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://localhost:${(s.address() as { port: number }).port}`;
    expect((await fetch(url + '/')).status).toBe(404);
    s.close();
    expect((await fetch(base + '/api/nothing')).status).toBe(404);
    expect((await fetch(base + '/', { method: 'POST' })).status).toBe(405);
  });

  it('sign-in rate limiting', async () => {
    const strict = createApp({ db, staticDir, rateLimit: 2, now: () => clock });
    const s = createServer(strict.handle);
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://localhost:${(s.address() as { port: number }).port}`;
    const login = () => fetch(url + '/api/login', { method: 'POST', body: '{}', headers: { 'x-forwarded-for': '9.9.9.9' } });
    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(429);
    clock += 61_000;
    expect((await login()).status).toBe(401);
    s.close();
  });

  it('unexpected error → 500 without details', async () => {
    const broken = new DatabaseSync(':memory:');
    const app500 = createApp({ db: broken, staticDir });
    const s = createServer(app500.handle);
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://localhost:${(s.address() as { port: number }).port}`;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(url + '/api/me', { headers: { cookie: 'sid=x' } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server' });
    expect(err).toHaveBeenCalled();
    s.close();
  });

  it('defaults to real time; secure cookie flag', async () => {
    const real = createApp({ db, staticDir, secureCookie: true });
    const s = createServer(real.handle);
    await new Promise<void>((r) => s.listen(0, r));
    const url = `http://localhost:${(s.address() as { port: number }).port}`;
    const res = await fetch(url + '/api/register', { method: 'POST', body: JSON.stringify({ login: 'secureuser', password: 'secret1' }) });
    expect(res.headers.get('set-cookie')).toContain('; Secure');
    expect(real.today()).toBe(Math.floor((Date.now() + 3 * 3_600_000) / 86_400_000));
    s.close();
  });
});

describe('database', () => {
  beforeEach(() => { /* each check uses its own database */ });

  it('migration adds new columns to an old database', () => {
    const file = join(dir, 'old.sqlite');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, pass TEXT NOT NULL,
      created INTEGER NOT NULL, level INTEGER NOT NULL DEFAULT 1, face TEXT NOT NULL DEFAULT '👩‍🌾')`);
    old.prepare('INSERT INTO users (login, name, pass, created) VALUES (?, ?, ?, ?)').run('Old', '\u0421\u0442\u0430\u0440\u044b\u0439 \u0424\u0435\u0440\u043c\u0435\u0440', 'x', 1);
    old.close();
    const mig = openDb(file);
    expect(mig.prepare('SELECT search, login_key FROM users').get()).toEqual({ search: 'old \u0441\u0442\u0430\u0440\u044b\u0439 \u0444\u0435\u0440\u043c\u0435\u0440', login_key: 'old' });
    // reopening breaks nothing
    mig.close();
    expect(() => openDb(file).close()).not.toThrow();
  });

  it('creates the full schema from scratch', () => {
    const fresh = openDb(join(dir, 'fresh', 'x.sqlite'));
    const tables = (fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(['events', 'farms', 'friends', 'gift_log', 'help_log', 'sessions', 'users']);
  });
});
