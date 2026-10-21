// Client for the server's HTTP API.
import type { Friend, InboxEvent } from '../core/game';
import type { GameState } from '../core/state';
import { t, tErr } from '../i18n';

export interface PublicUser { id: number; login: string; name: string; level: number; face: string }
export interface FriendFarm {
  owner: PublicUser & { helpLeft: number };
  farm: Pick<GameState, 'size' | 'plots' | 'objects' | 'look' | 'pet' | 'lastTick'> & { savedAt: number };
}

/** `message` is already translated to the player's language; `code` is the raw server error code. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code === 'network' ? t('err.network') : tErr(code)); this.status = status; this.code = code; }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive: method === 'PUT',
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'server');
  return data as T;
}

export const api = {
  /** false: the HTTP server; the static build uses net/local.ts (localStorage) instead */
  local: false as boolean,
  register: (login: string, password: string, name: string, face: string) => call<{ ok: true }>('POST', '/api/register', { login, password, name, face }),
  login: (login: string, password: string) => call<{ ok: true }>('POST', '/api/login', { login, password }),
  logout: () => call<{ ok: true }>('POST', '/api/logout'),
  me: () => call<{ user: PublicUser; farm: { state: GameState; rev: number } | null; events: InboxEvent[] }>('GET', '/api/me'),
  save: (state: GameState, rev: number, ack: number[], level: number, face: string) =>
    call<{ rev: number; events: InboxEvent[] }>('PUT', '/api/farm', { state, rev, ack, level, face }),
  events: () => call<{ events: InboxEvent[] }>('GET', '/api/events'),
  friends: () => call<{ friends: Friend[]; incoming: PublicUser[]; outgoing: PublicUser[] }>('GET', '/api/friends'),
  search: (q: string) => call<{ users: (PublicUser & { status: string | null })[] }>('GET', '/api/users/search?q=' + encodeURIComponent(q)),
  request: (id: number) => call<{ ok: true; status: string }>('POST', '/api/friends/request', { id }),
  accept: (id: number) => call<{ ok: true }>('POST', '/api/friends/accept', { id }),
  remove: (id: number) => call<{ ok: true }>('POST', '/api/friends/remove', { id }),
  farm: (id: number) => call<FriendFarm>('GET', `/api/farm/${id}`),
  help: (id: number, x: number, y: number, kind: 'chase' | 'water') => call<{ ok: boolean; left: number; error?: string }>('POST', `/api/help/${id}`, { x, y, kind }),
  gift: (id: number, key: string) => call<{ ok: boolean; error?: string }>('POST', `/api/gift/${id}`, { key }),
};

export type Api = typeof api;
