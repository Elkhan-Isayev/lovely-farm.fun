// Local development: API server (restarts on changes) + Vite with hot reload.
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['--watch-path=server', 'server/index.ts'], { stdio: 'inherit', env: { ...process.env, PORT: '3000' } }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
