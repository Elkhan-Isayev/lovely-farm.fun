// Lovely Farm HTTP API: accounts, farm saves, friendships, help and gifts.
// createApp knows nothing about ports or database files, which keeps it easy to test.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { loginKey } from './db.ts';

export const SESSION_DAYS = 60;
export const HELP_LIMIT = 5;
const MAX_BODY = 3_000_000;

export interface AppOptions {
  db: DatabaseSync;
  staticDir: string;
  secureCookie?: boolean;
  now?: () => number; // overridden in tests
  rateLimit?: number; // sign-in attempts per minute per IP
  trustProxy?: boolean; // behind our own reverse proxy: the client IP is the last X-Forwarded-For entry
}

/** Sent with every response. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/**
 * For the page itself: only our own scripts; Google Fonts; data: images (rendered icons); and Cloudflare
 * Web Analytics, which Cloudflare injects into pages it proxies (its beacon script and where it reports).
 */
export const CSP = [
  "default-src 'self'", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "media-src 'self'", "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

/* ---------------- utilities ---------------- */

/** `message` is an error code; the client translates it (err.<code>). */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

async function readBody(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'bad_json'); }
}

function cookies(req: IncomingMessage) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function checkPassword(pw: string, stored: string) {
  const [, salt, hash] = stored.split('$');
  const want = Buffer.from(hash, 'base64');
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), want.length);
  return timingSafeEqual(want, got);
}

export function createApp(opts: AppOptions) {
  const db = opts.db;
  const STATIC_DIR = opts.staticDir;
  const SECURE_COOKIE = !!opts.secureCookie;
  const now = opts.now ?? Date.now;
  const LIMIT = opts.rateLimit ?? 20;

  function sessionCookie(token: string, maxAge: number) {
    return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
  }

  /** Day number in Moscow time (UTC+3): one shared "day" for everyone. */
  function today() { return Math.floor((now() + 3 * 3_600_000) / 86_400_000); }

  /**
   * The client's address. X-Forwarded-For is only believed behind our own proxy, and then only its last
   * entry (the one the proxy appended): anything before it was sent by the client and can be forged.
   */
  function clientIp(req: IncomingMessage) {
    const fwd = opts.trustProxy ? (req.headers['x-forwarded-for'] as string | undefined)?.split(',').at(-1)?.trim() : '';
    return fwd || req.socket.remoteAddress || '?';
  }

  // simple rate limiting for sign-in/sign-up
  const hits = new Map<string, { n: number; t: number }>();
  function rateLimit(req: IncomingMessage, limit = LIMIT) {
    const ip = clientIp(req);
    const t = now();
    const h = hits.get(ip);
    if (!h || t - h.t > 60_000) { hits.set(ip, { n: 1, t }); return; }
    if (++h.n > limit) throw new HttpError(429, 'rate_limited');
  }

  /* ---------------- sessions ---------------- */

  interface User { id: number; login: string; name: string; level: number; face: string }

  function currentUser(req: IncomingMessage): User | null {
    const sid = cookies(req).sid;
    if (!sid) return null;
    const row = db.prepare(
      `SELECT u.id, u.login, u.name, u.level, u.face FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires > ?`,
    ).get(sid, now()) as User | undefined;
    return row ?? null;
  }
  function requireUser(req: IncomingMessage) {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, 'auth_required');
    return u;
  }
  function startSession(userId: number) {
    const token = randomBytes(32).toString('base64url');
    const expires = now() + SESSION_DAYS * 86_400_000;
    db.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?, ?, ?, ?)').run(token, userId, now(), expires);
    return sessionCookie(token, SESSION_DAYS * 86_400);
  }

  /* ---------------- friendships ---------------- */

  function friendship(a: number, b: number) {
    return db.prepare('SELECT * FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').get(a, b, b, a) as
      { a: number; b: number; status: string } | undefined;
  }
  function areFriends(a: number, b: number) { return friendship(a, b)?.status === 'accepted'; }

  function helpUsed(helper: number, owner: number) {
    return (db.prepare('SELECT COUNT(*) n FROM help_log WHERE helper = ? AND owner = ? AND day = ?').get(helper, owner, today()) as { n: number }).n;
  }

  function publicUser(u: { id: number; login: string; name: string; level: number; face: string }) {
    return { id: u.id, login: u.login, name: u.name, level: u.level, face: u.face };
  }

  /* ---------------- routes ---------------- */

  // 3–24 Latin or Cyrillic letters, digits, _ . -
  const LOGIN_RE = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Nd}_.\-]{3,24}$/u;
  const GIFT_RE = /^(item:(wood|straw|nails|film)|tree:(orange|olive|avocado|banana|birch|rowan)|animal:(pig|ostrich|horse|burenka))$/;

  type Handler = (req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void> | void;
  const routes: [string, RegExp, Handler][] = [];
  const route = (method: string, path: string, h: Handler) =>
    routes.push([method, new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$'), h]);

  // liveness for the container health check and deploys: the process answers and the database works
  route('GET', '/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    json(res, 200, { ok: true });
  });

  route('POST', '/api/register', async (req, res) => {
    rateLimit(req, Math.ceil(LIMIT / 2));
    const { login, password, name, face } = await readBody(req);
    if (typeof login !== 'string' || !LOGIN_RE.test(login)) throw new HttpError(400, 'bad_login');
    if (typeof password !== 'string' || password.length < 6) throw new HttpError(400, 'bad_password');
    const display = (typeof name === 'string' && name.trim() ? name.trim() : login).slice(0, 32);
    if (db.prepare('SELECT 1 FROM users WHERE login_key = ?').get(loginKey(login))) throw new HttpError(409, 'login_taken');
    const r = db.prepare('INSERT INTO users (login, login_key, name, pass, created, level, face, search) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .run(login, loginKey(login), display, hashPassword(password), now(), typeof face === 'string' ? face.slice(0, 16) : '👩‍🌾', `${login} ${display}`.toLowerCase());
    const cookie = startSession(Number(r.lastInsertRowid));
    json(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  });

  route('POST', '/api/login', async (req, res) => {
    rateLimit(req);
    const { login, password } = await readBody(req);
    const u = db.prepare('SELECT id, pass FROM users WHERE login_key = ?').get(loginKey(String(login ?? ''))) as { id: number; pass: string } | undefined;
    if (!u || !checkPassword(String(password ?? ''), u.pass)) throw new HttpError(401, 'wrong_credentials');
    json(res, 200, { ok: true }, { 'Set-Cookie': startSession(u.id) });
  });

  route('POST', '/api/logout', (req, res) => {
    const sid = cookies(req).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  });

  route('GET', '/api/me', (req, res) => {
    const u = requireUser(req);
    const farm = db.prepare('SELECT state, rev FROM farms WHERE user_id = ?').get(u.id) as { state: string; rev: number } | undefined;
    json(res, 200, { user: publicUser(u), farm: farm ? { state: JSON.parse(farm.state), rev: farm.rev } : null, events: pendingEvents(u.id) });
  });

  function pendingEvents(userId: number) {
    const rows = db.prepare(
      `SELECT e.id, e.type, e.payload, u.name fromName, u.face fromFace FROM events e JOIN users u ON u.id = e.from_id
       WHERE e.user_id = ? AND e.delivered = 0 ORDER BY e.id LIMIT 200`,
    ).all(userId) as { id: number; type: string; payload: string; fromName: string; fromFace: string }[];
    return rows.map((r) => ({ id: r.id, type: r.type, fromName: r.fromName, fromFace: r.fromFace, ...JSON.parse(r.payload) }));
  }

  // Farm save. `rev` guards against two open tabs; `ack` confirms events already included in the state.
  route('PUT', '/api/farm', async (req, res) => {
    const u = requireUser(req);
    const { state, rev, ack, level, face } = await readBody(req);
    if (!state || typeof state !== 'object') throw new HttpError(400, 'no_state');
    const cur = db.prepare('SELECT rev FROM farms WHERE user_id = ?').get(u.id) as { rev: number } | undefined;
    if (cur && cur.rev !== rev) throw new HttpError(409, 'conflict');
    const newRev = (cur?.rev ?? 0) + 1;
    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO farms (user_id, state, rev, updated) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, rev = excluded.rev, updated = excluded.updated`,
      ).run(u.id, JSON.stringify(state), newRev, now());
      db.prepare('UPDATE users SET level = ?, face = COALESCE(?, face) WHERE id = ?')
        .run(Math.max(1, Math.min(99, Number(level) || 1)), typeof face === 'string' ? face.slice(0, 16) : null, u.id);
      if (Array.isArray(ack) && ack.length) {
        const mark = db.prepare('UPDATE events SET delivered = 1 WHERE id = ? AND user_id = ?');
        for (const id of ack.slice(0, 500)) mark.run(Number(id), u.id);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    json(res, 200, { rev: newRev, events: pendingEvents(u.id) });
  });

  route('GET', '/api/events', (req, res) => {
    const u = requireUser(req);
    json(res, 200, { events: pendingEvents(u.id) });
  });

  route('GET', '/api/friends', (req, res) => {
    const u = requireUser(req);
    const rows = db.prepare(
      `SELECT f.a, f.b, f.status, u.id, u.login, u.name, u.level, u.face FROM friends f
       JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
       WHERE f.a = ? OR f.b = ?`,
    ).all(u.id, u.id, u.id) as any[];
    const day = today();
    const friends = [], incoming = [], outgoing = [];
    for (const r of rows) {
      const pu = publicUser(r);
      if (r.status === 'accepted') {
        const giftSent = !!db.prepare('SELECT 1 FROM gift_log WHERE sender = ? AND receiver = ? AND day = ?').get(u.id, r.id, day);
        friends.push({ ...pu, helpLeft: Math.max(0, HELP_LIMIT - helpUsed(u.id, r.id)), giftSent });
      } else if (r.b === u.id) incoming.push(pu);
      else outgoing.push(pu);
    }
    friends.sort((x, y) => y.level - x.level);
    json(res, 200, { friends, incoming, outgoing });
  });

  route('GET', '/api/users/search', (req, res) => {
    const u = requireUser(req);
    const q = new URL(req.url!, 'http://x').searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) return json(res, 200, { users: [] });
    const like = '%' + q.toLowerCase().replace(/[%_]/g, '') + '%';
    const rows = db.prepare('SELECT id, login, name, level, face FROM users WHERE search LIKE ? AND id != ? ORDER BY level DESC LIMIT 20')
      .all(like, u.id) as any[];
    json(res, 200, { users: rows.map((r) => ({ ...publicUser(r), status: friendship(u.id, r.id)?.status ?? null })) });
  });

  route('POST', '/api/friends/request', async (req, res) => {
    const u = requireUser(req);
    const id = Number((await readBody(req)).id);
    if (!id || id === u.id || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw new HttpError(404, 'user_not_found');
    const f = friendship(u.id, id);
    if (!f) db.prepare('INSERT INTO friends (a, b, status, created) VALUES (?, ?, ?, ?)').run(u.id, id, 'pending', now());
    else if (f.status === 'pending' && f.b === u.id) db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?").run(f.a, f.b);
    json(res, 200, { ok: true, status: friendship(u.id, id)?.status });
  });

  route('POST', '/api/friends/accept', async (req, res) => {
    const u = requireUser(req);
    const id = Number((await readBody(req)).id);
    db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ? AND status = 'pending'").run(id, u.id);
    json(res, 200, { ok: true });
  });

  route('POST', '/api/friends/remove', async (req, res) => {
    const u = requireUser(req);
    const id = Number((await readBody(req)).id);
    db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').run(u.id, id, id, u.id);
    json(res, 200, { ok: true });
  });

  /** A friend's farm: the saved state with not-yet-delivered help applied on top. */
  route('GET', '/api/farm/:id', (req, res, [idStr]) => {
    const u = requireUser(req);
    const id = Number(idStr);
    if (!areFriends(u.id, id)) throw new HttpError(403, 'friends_only');
    const owner = db.prepare('SELECT id, login, name, level, face FROM users WHERE id = ?').get(id) as any;
    const farm = db.prepare('SELECT state FROM farms WHERE user_id = ?').get(id) as { state: string } | undefined;
    if (!owner || !farm) throw new HttpError(404, 'farm_missing');
    const s = JSON.parse(farm.state);
    const help = db.prepare("SELECT payload FROM events WHERE user_id = ? AND type = 'help' AND delivered = 0").all(id) as { payload: string }[];
    for (const h of help) {
      const { x, y, kind } = JSON.parse(h.payload);
      const p = s.plots?.[`${x},${y}`];
      if (p) { if (kind === 'chase') p.pest = null; else p.watered = true; }
    }
    json(res, 200, {
      owner: { ...publicUser(owner), helpLeft: Math.max(0, HELP_LIMIT - helpUsed(u.id, id)) },
      farm: { size: s.size, plots: s.plots, objects: s.objects, look: s.look, pet: s.pet, lastTick: s.lastTick, savedAt: s.clock?.game ?? s.lastTick },
    });
  });

  route('POST', '/api/help/:id', async (req, res, [idStr]) => {
    const u = requireUser(req);
    const id = Number(idStr);
    if (!areFriends(u.id, id)) throw new HttpError(403, 'friends_only');
    const { x, y, kind } = await readBody(req);
    if (!Number.isInteger(x) || !Number.isInteger(y) || (kind !== 'chase' && kind !== 'water')) throw new HttpError(400, 'bad_help');
    const used = helpUsed(u.id, id);
    if (used >= HELP_LIMIT) return json(res, 200, { ok: false, left: 0, error: 'help_limit' });
    const farm = db.prepare('SELECT state FROM farms WHERE user_id = ?').get(id) as { state: string } | undefined;
    const p = farm && JSON.parse(farm.state).plots?.[`${x},${y}`];
    if (!p || p.state !== 'growing') return json(res, 200, { ok: false, left: HELP_LIMIT - used, error: 'help_not_needed' });
    const cell = `${x},${y}`;
    try {
      db.prepare('INSERT INTO help_log (helper, owner, day, cell) VALUES (?, ?, ?, ?)').run(u.id, id, today(), cell);
    } catch {
      return json(res, 200, { ok: false, left: HELP_LIMIT - used, error: 'help_done' });
    }
    db.prepare('INSERT INTO events (user_id, from_id, type, payload, created) VALUES (?, ?, ?, ?, ?)')
      .run(id, u.id, 'help', JSON.stringify({ x, y, kind }), now());
    json(res, 200, { ok: true, left: HELP_LIMIT - used - 1 });
  });

  route('POST', '/api/gift/:id', async (req, res, [idStr]) => {
    const u = requireUser(req);
    const id = Number(idStr);
    if (!areFriends(u.id, id)) throw new HttpError(403, 'friends_only');
    const { key } = await readBody(req);
    if (typeof key !== 'string' || !GIFT_RE.test(key)) throw new HttpError(400, 'bad_gift');
    try {
      db.prepare('INSERT INTO gift_log (sender, receiver, day) VALUES (?, ?, ?)').run(u.id, id, today());
    } catch {
      return json(res, 200, { ok: false, error: 'gift_done' });
    }
    db.prepare('INSERT INTO events (user_id, from_id, type, payload, created) VALUES (?, ?, ?, ?, ?)')
      .run(id, u.id, 'gift', JSON.stringify({ key }), now());
    json(res, 200, { ok: true });
  });

  /* ---------------- static files (built client) ---------------- */

  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
    '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  };

  async function serveStatic(req: IncomingMessage, res: ServerResponse) {
    const urlPath = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    let file = normalize(join(STATIC_DIR, urlPath));
    if (!file.startsWith(STATIC_DIR)) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      // client-side routes get the app; a missing file (it has an extension) is a real 404
      if (extname(urlPath)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
      file = join(STATIC_DIR, 'index.html');
    }
    try {
      const data = await readFile(file);
      const immutable = file.includes(`${join(STATIC_DIR, 'assets')}`);
      const headers: Record<string, string | number> = {
        ...(extname(file) === '.html' ? { 'Content-Security-Policy': CSP } : {}),
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'Accept-Ranges': 'bytes',
      };
      // byte ranges: the browser streams and seeks music this way
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const size = data.length;
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start >= size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
          return;
        }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        res.end(data.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': data.length });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Client is not built: run npm run build');
    }
  }

  /* ---------------- request handler ---------------- */

    async function handle(req: IncomingMessage, res: ServerResponse) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
      try {
        const path = new URL(req.url!, 'http://x').pathname;
        if (path.startsWith('/api/')) {
          for (const [method, re, h] of routes) {
            const m = req.method === method && path.match(re);
            if (m) return await h(req, res, m.slice(1));
          }
          throw new HttpError(404, 'not_found');
        }
        if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res);
        res.writeHead(405).end();
      } catch (e) {
        // the body was not fully read, so the connection must not be reused
      if (e instanceof HttpError) return json(res, e.status, { error: e.message }, e.status === 413 ? { Connection: 'close' } : {});
        console.error(e);
        json(res, 500, { error: 'server' });
      }
    }

    /** Purge expired sessions, old logs and delivered events. */
    function cleanup() {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(now());
      db.prepare('DELETE FROM help_log WHERE day < ?').run(today() - 2);
      db.prepare('DELETE FROM gift_log WHERE day < ?').run(today() - 2);
      db.prepare('DELETE FROM events WHERE delivered = 1 AND created < ?').run(now() - 7 * 86_400_000);
    }

    return { handle, cleanup, today };
}
