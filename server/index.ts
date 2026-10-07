// Entry point: Node 24 runs TypeScript directly (type stripping); the database is the built-in node:sqlite.
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
const dbFile = join(DATA_DIR, 'farm.sqlite');

const app = createApp({
  db: openDb(dbFile),
  staticDir: resolve(process.env.STATIC_DIR ?? 'dist'),
  secureCookie: process.env.SECURE_COOKIE === '1',
});

createServer(app.handle).listen(PORT, () => {
  console.log(`🌻 Lovely Farm: http://localhost:${PORT}  (database: ${dbFile})`);
});

setInterval(app.cleanup, 3_600_000).unref();
