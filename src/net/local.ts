// The "server" of the static build (GitHub Pages): the player's profile and farm live in this browser's
// localStorage. It has the same interface as the HTTP API, so the game does not know the difference —
// saving, the two-tabs conflict check and the start screen all work. Friends need a real server,
// so there are none here; villagers and showcase farms do not need one and work as usual.
import { t } from '../i18n';
import { ApiError, type Api, type PublicUser } from './api';
import type { GameState } from '../core/state';

export const LOCAL_USER = 'lovely-farm-local-user';
export const LOCAL_FARM = 'lovely-farm-local-farm';

interface StoredFarm { state: GameState; rev: number }

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { throw new ApiError(507, 'storage_full'); }
}

/** Anything that needs other players. */
const noServer = async (): Promise<never> => { throw new ApiError(0, 'network'); };

export const localApi: Api = {
  local: true,
  // the start screen passes the player's name; there is no password to check on one's own computer
  register: async (login, _password, name, face) => {
    const display = (name || login).trim().slice(0, 32) || t('hud.farmer');
    write(LOCAL_USER, { id: 1, login: 'local', name: display, level: 1, face } satisfies PublicUser);
    return { ok: true };
  },
  login: async () => {
    if (!read<PublicUser>(LOCAL_USER)) throw new ApiError(401, 'auth_required');
    return { ok: true };
  },
  logout: async () => ({ ok: true }),
  me: async () => {
    const user = read<PublicUser>(LOCAL_USER);
    if (!user) throw new ApiError(401, 'auth_required');
    return { user, farm: read<StoredFarm>(LOCAL_FARM), events: [] };
  },
  save: async (state, rev, _ack, level, face) => {
    // another tab saved in the meantime: the same "opened elsewhere" dialog as with a server
    const stored = read<StoredFarm>(LOCAL_FARM);
    if (stored && stored.rev !== rev) throw new ApiError(409, 'conflict');
    write(LOCAL_FARM, { state, rev: rev + 1 } satisfies StoredFarm);
    const user = read<PublicUser>(LOCAL_USER);
    if (user) write(LOCAL_USER, { ...user, level, face });
    return { rev: rev + 1, events: [] };
  },
  events: async () => ({ events: [] }),
  friends: async () => ({ friends: [], incoming: [], outgoing: [] }),
  search: async () => ({ users: [] }),
  request: noServer,
  accept: noServer,
  remove: noServer,
  farm: noServer,
  help: noServer,
  gift: noServer,
};
