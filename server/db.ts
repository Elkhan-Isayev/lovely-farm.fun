import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id      INTEGER PRIMARY KEY,
      login   TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name    TEXT NOT NULL,
      pass    TEXT NOT NULL,
      created INTEGER NOT NULL,
      level   INTEGER NOT NULL DEFAULT 1,
      face    TEXT NOT NULL DEFAULT '👩‍🌾'
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token   TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS farms (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state   TEXT NOT NULL,
      rev     INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    -- a sent a request to b; status: pending | accepted
    CREATE TABLE IF NOT EXISTS friends (
      a       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      b       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status  TEXT NOT NULL,
      created INTEGER NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE INDEX IF NOT EXISTS friends_b ON friends(b);
    -- inbox: help and gifts that the owner's client will apply to their farm
    CREATE TABLE IF NOT EXISTS events (
      id        INTEGER PRIMARY KEY,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type      TEXT NOT NULL,
      payload   TEXT NOT NULL,
      created   INTEGER NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS events_user ON events(user_id, delivered);
    CREATE TABLE IF NOT EXISTS help_log (
      helper INTEGER NOT NULL,
      owner  INTEGER NOT NULL,
      day    INTEGER NOT NULL,
      cell   TEXT NOT NULL,
      PRIMARY KEY (helper, owner, day, cell)
    );
    CREATE TABLE IF NOT EXISTS gift_log (
      sender   INTEGER NOT NULL,
      receiver INTEGER NOT NULL,
      day      INTEGER NOT NULL,
      PRIMARY KEY (sender, receiver, day)
    );
  `);
  // migration: case-insensitive search column (SQLite LIKE doesn't case-fold Cyrillic)
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'search')) {
    db.exec("ALTER TABLE users ADD COLUMN search TEXT NOT NULL DEFAULT ''");
    const rows = db.prepare('SELECT id, login, name FROM users').all() as { id: number; login: string; name: string }[];
    const upd = db.prepare('UPDATE users SET search = ? WHERE id = ?');
    for (const r of rows) upd.run(`${r.login} ${r.name}`.toLowerCase(), r.id);
  }
  // migration: normalized login. SQLite NOCASE only folds ASCII, so two logins differing
  // only in Cyrillic letter case would otherwise be different accounts.
  if (!cols.some((c) => c.name === 'login_key')) {
    db.exec("ALTER TABLE users ADD COLUMN login_key TEXT NOT NULL DEFAULT ''");
    const rows = db.prepare('SELECT id, login FROM users').all() as { id: number; login: string }[];
    const upd = db.prepare('UPDATE users SET login_key = ? WHERE id = ?');
    for (const r of rows) upd.run(loginKey(r.login), r.id);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_login_key ON users(login_key)');
  return db;
}

/** Login key: case-insensitive, Cyrillic "yo" (\u0451) treated as "ye" (\u0435). */
export function loginKey(login: string) {
  return login.normalize('NFC').toLowerCase().replace(/\u0451/g, '\u0435');
}
