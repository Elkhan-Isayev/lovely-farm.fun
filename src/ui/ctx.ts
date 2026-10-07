import type { GameAudio } from '../audio/audio';
import type { Friend, Game } from '../core/game';
import type { ShowcaseId } from '../core/showcase';
import type { Api, PublicUser } from '../net/api';
import type { Controller } from './controller';

/** Everything the UI windows need. */
export interface AppCtx {
  game: Game;
  ctrl: Controller;
  api: Api | null;
  user: PublicUser | null;
  incoming: PublicUser[];
  outgoing: PublicUser[];
  refreshFriends(): Promise<void>;
  visitFriend(f: Friend): Promise<void>;
  visitNpc(id: string): void;
  visitShowcase(id: ShowcaseId): void;
  goHome(): void;
  logout(): void;
  dev: boolean;
  audio?: GameAudio;
}
